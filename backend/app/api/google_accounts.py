from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.auth import (
    _STATE_COOKIE,
    _STATE_COOKIE_PATH,
    _STATE_MAX_AGE_SECONDS,
    _require_google_configured,
    build_oauth_state,
)
from app.api.deps import get_current_user
from app.core import google_oauth
from app.core.config import settings
from app.core.time import utcnow
from app.database import get_db
from app.models.contact import Contact
from app.models.google_account import GoogleAccount
from app.models.user import User
from app.schemas.contact import SyncContactsResponse
from app.schemas.google_account import (
    ConnectGoogleAccountRequest,
    ConnectGoogleAccountResponse,
    GoogleAccountResponse,
)

router = APIRouter(prefix="/google-accounts", tags=["google-accounts"])


async def _valid_access_token(db: AsyncSession, account: GoogleAccount) -> str:
    """Return a non-expired access token for `account`, refreshing via
    refresh_token if needed and persisting the new token."""
    expired = (
        account.expires_at is not None
        and account.expires_at < utcnow().replace(tzinfo=None)
    )
    if expired:
        if not account.refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google access expired and no refresh token is available",
            )
        payload = await google_oauth.refresh_access_token(account.refresh_token)
        account.access_token = payload.get("access_token", account.access_token)
        if payload.get("refresh_token"):
            account.refresh_token = payload["refresh_token"]
        account.expires_at = google_oauth.compute_expires_at(payload.get("expires_in"))
        await db.commit()
    return account.access_token


def _connection_to_fields(conn: dict) -> dict | None:
    """Translate a People API connection row into the shape we persist.
    Returns None if the row has nothing usable (no name + no email)."""
    names = conn.get("names") or []
    emails = conn.get("emailAddresses") or []
    photos = conn.get("photos") or []
    name = (names[0].get("displayName") if names else "") or (
        emails[0].get("value") if emails else ""
    )
    if not name:
        return None
    return {
        "google_contact_id": conn.get("resourceName"),
        "name": name,
        "email": emails[0].get("value") if emails else None,
        "image_url": photos[0].get("url") if photos else None,
    }


@router.get("", response_model=List[GoogleAccountResponse])
async def list_google_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GoogleAccount)
        .filter(GoogleAccount.user_id == current_user.id)
        .order_by(GoogleAccount.id)
    )
    return result.scalars().all()


@router.post("/connect", response_model=ConnectGoogleAccountResponse)
async def connect_google_account(
    body: ConnectGoogleAccountRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """Mint an authorize URL the frontend will navigate to. The state cookie
    pins the current user so the callback knows this is an additive
    "connect another account" flow instead of a fresh login.
    """
    _require_google_configured()
    scopes = list(dict.fromkeys(google_oauth.LOGIN_SCOPES + body.extra_scopes))
    state = build_oauth_state(user_id=current_user.id, scopes=scopes)
    response.set_cookie(
        _STATE_COOKIE,
        state,
        max_age=_STATE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=settings.APP_URL.startswith("https://"),
        path=_STATE_COOKIE_PATH,
    )
    return ConnectGoogleAccountResponse(
        authorize_url=google_oauth.build_authorize_url(state=state, scopes=scopes)
    )


@router.post(
    "/{account_id}/sync-contacts", response_model=SyncContactsResponse
)
async def sync_google_contacts(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pull the user's Google contacts into the local Contact table.
    Upserts by google_contact_id so re-running the sync updates names /
    emails / photos in place. Doesn't remove contacts that are gone from
    Google — that's left as a future "prune" knob."""
    _require_google_configured()

    result = await db.execute(
        select(GoogleAccount).filter(
            GoogleAccount.id == account_id,
            GoogleAccount.user_id == current_user.id,
        )
    )
    account = result.scalars().first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google account not found",
        )

    if google_oauth.CONTACTS_SCOPE not in (account.scopes or ""):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This Google account hasn't been granted the contacts "
                "scope. Reconnect it with the Contactos permission "
                "checked."
            ),
        )

    access_token = await _valid_access_token(db, account)
    connections = await google_oauth.fetch_google_contacts(access_token)

    # Pre-fetch existing google-sourced contacts for this account so we
    # can upsert in O(1) by resource name.
    existing_result = await db.execute(
        select(Contact).filter(
            Contact.user_id == current_user.id,
            Contact.google_account_id == account.id,
        )
    )
    existing = {c.google_contact_id: c for c in existing_result.scalars().all()}

    added = 0
    updated = 0
    for conn in connections:
        fields = _connection_to_fields(conn)
        if not fields:
            continue
        rid = fields["google_contact_id"]
        if rid in existing:
            row = existing[rid]
            changed = False
            for key in ("name", "email", "image_url"):
                if getattr(row, key) != fields[key]:
                    setattr(row, key, fields[key])
                    changed = True
            if changed:
                updated += 1
        else:
            db.add(
                Contact(
                    user_id=current_user.id,
                    source="google",
                    google_account_id=account.id,
                    google_contact_id=rid,
                    name=fields["name"],
                    email=fields["email"],
                    image_url=fields["image_url"],
                )
            )
            added += 1

    await db.commit()
    return SyncContactsResponse(
        added=added, updated=updated, total=len(connections)
    )


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_google_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GoogleAccount).filter(
            GoogleAccount.id == account_id,
            GoogleAccount.user_id == current_user.id,
        )
    )
    account = result.scalars().first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google account not found",
        )
    await db.delete(account)
    await db.commit()
    return None
