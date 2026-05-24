"""WebAuthn passkey registration + authentication.

Two halves:
  - Authenticated user manages their passkeys (begin/finish register +
    list + delete).
  - Anonymous client logs in with a previously-registered passkey
    (begin/finish login → returns a regular Alfred JWT).

Challenge state lives in a small in-process dict with a 5-minute TTL.
For a multi-worker deployment swap this for Redis.
"""
from __future__ import annotations

import json
import secrets
import time
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token
from app.core.time import utcnow
from app.database import get_db
from app.models.passkey import Passkey
from app.models.user import User
from app.schemas.user import Token

router = APIRouter(prefix="/passkeys", tags=["passkeys"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CHALLENGES: dict[str, tuple[bytes, float]] = {}
_CHALLENGE_TTL = 300.0  # 5 minutes


def _stash(key: str, challenge: bytes) -> None:
    _purge()
    _CHALLENGES[key] = (challenge, time.time() + _CHALLENGE_TTL)


def _pop(key: str) -> Optional[bytes]:
    _purge()
    entry = _CHALLENGES.pop(key, None)
    return entry[0] if entry else None


def _purge() -> None:
    now = time.time()
    for k, (_, exp) in list(_CHALLENGES.items()):
        if exp < now:
            _CHALLENGES.pop(k, None)


def _rp_id() -> str:
    """Match the eTLD+1 the browser will report. Falls back to APP_URL's
    host so the dev setup just works without manual config."""
    if settings.WEBAUTHN_RP_ID:
        return settings.WEBAUTHN_RP_ID
    return urlparse(settings.APP_URL).hostname or "localhost"


def _origin() -> str:
    return (settings.WEBAUTHN_ORIGIN or settings.APP_URL).rstrip("/")


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class RegisterBeginRequest(BaseModel):
    label: Optional[str] = None


class RegisterFinishRequest(BaseModel):
    label: Optional[str] = None
    credential: dict  # PublicKeyCredential.toJSON() from the browser


@router.post("/register/begin")
async def register_begin(
    body: RegisterBeginRequest,
    current_user: User = Depends(get_current_user),
):
    options = generate_registration_options(
        rp_id=_rp_id(),
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=str(current_user.id).encode("utf-8"),
        user_name=current_user.email,
        user_display_name=current_user.email,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )
    _stash(f"register:{current_user.id}", options.challenge)
    return json.loads(options_to_json(options))


@router.post("/register/finish")
async def register_finish(
    body: RegisterFinishRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    challenge = _pop(f"register:{current_user.id}")
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No registration in progress",
        )
    try:
        verification = verify_registration_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_rp_id=_rp_id(),
            expected_origin=_origin(),
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration failed: {exc}",
        )

    transports = body.credential.get("response", {}).get("transports") or []
    pk = Passkey(
        user_id=current_user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        label=body.label,
        transports=",".join(transports) or None,
    )
    db.add(pk)
    await db.commit()
    await db.refresh(pk)
    return {"id": pk.id, "label": pk.label}


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class LoginBeginRequest(BaseModel):
    pass


class LoginFinishRequest(BaseModel):
    state: str  # opaque token issued by /login/begin
    credential: dict


@router.post("/login/begin")
async def login_begin(_body: LoginBeginRequest):
    options = generate_authentication_options(
        rp_id=_rp_id(),
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    state = secrets.token_urlsafe(16)
    _stash(f"login:{state}", options.challenge)
    payload = json.loads(options_to_json(options))
    payload["state"] = state
    return payload


@router.post("/login/finish", response_model=Token)
async def login_finish(
    body: LoginFinishRequest,
    db: AsyncSession = Depends(get_db),
):
    challenge = _pop(f"login:{body.state}")
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No login in progress",
        )

    try:
        raw_credential_id = base64url_to_bytes(body.credential["id"])
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed credential"
        )

    passkey = (
        await db.execute(
            select(Passkey).filter(Passkey.credential_id == raw_credential_id)
        )
    ).scalars().first()
    if passkey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Passkey not registered"
        )

    try:
        verification = verify_authentication_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_rp_id=_rp_id(),
            expected_origin=_origin(),
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Authentication failed: {exc}",
        )

    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = utcnow().replace(tzinfo=None)
    await db.commit()

    user = (
        await db.execute(select(User).filter(User.id == passkey.user_id))
    ).scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    token = create_access_token(data={"sub": user.email, "user_id": user.id})
    return Token(access_token=token, token_type="bearer")


# ---------------------------------------------------------------------------
# Management
# ---------------------------------------------------------------------------


@router.get("")
async def list_passkeys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Passkey).filter(Passkey.user_id == current_user.id)
        )
    ).scalars().all()
    return [
        {
            "id": p.id,
            "label": p.label,
            "created_at": p.created_at.isoformat() + "Z" if p.created_at else None,
            "last_used_at": p.last_used_at.isoformat() + "Z" if p.last_used_at else None,
        }
        for p in rows
    ]


@router.delete("/{passkey_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passkey(
    passkey_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pk = (
        await db.execute(
            select(Passkey).filter(
                Passkey.id == passkey_id,
                Passkey.user_id == current_user.id,
            )
        )
    ).scalars().first()
    if pk:
        await db.delete(pk)
        await db.commit()
    return None
