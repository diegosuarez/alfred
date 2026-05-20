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
from app.database import get_db
from app.models.google_account import GoogleAccount
from app.models.user import User
from app.schemas.google_account import (
    ConnectGoogleAccountRequest,
    ConnectGoogleAccountResponse,
    GoogleAccountResponse,
)

router = APIRouter(prefix="/google-accounts", tags=["google-accounts"])


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
