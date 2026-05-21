import logging
from typing import List

import httpx
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

log = logging.getLogger(__name__)

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
    try:
        connections = await google_oauth.fetch_google_contacts(access_token)
    except httpx.HTTPStatusError as exc:
        log.warning(
            "Google People API returned %s for account %s: %s",
            exc.response.status_code,
            account.id,
            exc.response.text[:300],
        )
        # If the token rotted out from under us between expires_at and
        # now, try a refresh + retry once.
        if exc.response.status_code in (401, 403) and account.refresh_token:
            try:
                payload = await google_oauth.refresh_access_token(account.refresh_token)
            except httpx.HTTPStatusError as refresh_exc:
                log.warning("Refresh failed for account %s: %s", account.id, refresh_exc)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Google rejected the saved credentials. Reconnect the account.",
                )
            account.access_token = payload.get("access_token", account.access_token)
            if payload.get("refresh_token"):
                account.refresh_token = payload["refresh_token"]
            account.expires_at = google_oauth.compute_expires_at(payload.get("expires_in"))
            await db.commit()
            try:
                connections = await google_oauth.fetch_google_contacts(account.access_token)
            except httpx.HTTPStatusError as retry_exc:
                log.warning(
                    "Google People API still %s after refresh: %s",
                    retry_exc.response.status_code,
                    retry_exc.response.text[:300],
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Google rejected the contacts request ({retry_exc.response.status_code}).",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Google rejected the contacts request ({exc.response.status_code}).",
            )
    except httpx.HTTPError as exc:
        log.exception("Network error talking to Google People API")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach Google contacts: {exc.__class__.__name__}",
        )

    # Pre-fetch existing contacts so we can upsert without hitting the
    # uq_contact_user_email constraint. We index by both google_contact_id
    # (preferred match) and email (fallback — used to "claim" an existing
    # row when it surfaces from Google for the first time).
    existing_result = await db.execute(
        select(Contact).filter(Contact.user_id == current_user.id)
    )
    all_existing = existing_result.scalars().all()
    by_rid = {
        c.google_contact_id: c
        for c in all_existing
        if c.google_contact_id and c.google_account_id == account.id
    }
    by_email = {c.email: c for c in all_existing if c.email}

    added = 0
    updated = 0
    for conn in connections:
        fields = _connection_to_fields(conn)
        if not fields:
            continue
        rid = fields["google_contact_id"]
        email = fields["email"]

        row = by_rid.get(rid)
        if row is None and email and email in by_email:
            # An existing contact (manual or from another account) carries
            # the same email — adopt it under this account instead of
            # crashing on the unique-by-email constraint.
            row = by_email[email]

        if row is None:
            row = Contact(
                user_id=current_user.id,
                source="google",
                google_account_id=account.id,
                google_contact_id=rid,
                name=fields["name"],
                email=email,
                image_url=fields["image_url"],
            )
            db.add(row)
            if email:
                by_email[email] = row
            by_rid[rid] = row
            added += 1
        else:
            changed = False
            for key in ("name", "email", "image_url"):
                if getattr(row, key) != fields[key]:
                    setattr(row, key, fields[key])
                    changed = True
            if row.source != "google":
                row.source = "google"
                changed = True
            if row.google_account_id != account.id:
                row.google_account_id = account.id
                changed = True
            if row.google_contact_id != rid:
                row.google_contact_id = rid
                changed = True
            if changed:
                updated += 1

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
