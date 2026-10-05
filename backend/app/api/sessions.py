from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.core.sessions import (
    REFRESH_COOKIE,
    access_token_for,
    clear_refresh_cookie,
    is_active,
    revoke,
    session_from_cookie,
    set_refresh_cookie,
    touch,
)
from app.database import get_db
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.user import Token
from app.schemas.user_session import UserSessionResponse

# Shares the /auth prefix so the refresh cookie (Path=/api/auth) reaches
# every endpoint here.
router = APIRouter(prefix="/auth", tags=["sessions"])


@router.post("/refresh", response_model=Token)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Trade the refresh cookie for a new access JWT and slide the
    session's expiry. The cookie value is not rotated: concurrent tabs
    refreshing at once would otherwise race each other into a logout."""
    session = await session_from_cookie(db, request)
    user = None
    if session is not None:
        user = (
            await db.execute(select(User).filter(User.id == session.user_id))
        ).scalars().first()
    if session is None or user is None:
        # Built by hand: raising HTTPException would drop the header
        # that deletes the dead cookie.
        denied = JSONResponse(
            {"detail": "No active session"},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
        clear_refresh_cookie(denied)
        return denied

    touch(session)
    await db.commit()
    set_refresh_cookie(response, request.cookies[REFRESH_COOKIE])
    return Token(access_token=access_token_for(user, session), token_type="bearer")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Revoke this device's remembered session, if it has one. Cookie
    based, so it works even when the access JWT has already expired."""
    session = await session_from_cookie(db, request)
    if session is not None:
        revoke(session)
        await db.commit()
    clear_refresh_cookie(response)


@router.get("/sessions", response_model=List[UserSessionResponse])
async def list_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current = await session_from_cookie(db, request)
    rows = (
        await db.execute(
            select(UserSession)
            .filter(UserSession.user_id == current_user.id)
            .order_by(UserSession.last_used_at.desc())
        )
    ).scalars().all()
    return [
        UserSessionResponse.model_validate(row).model_copy(
            update={"current": current is not None and row.id == current.id}
        )
        for row in rows
        if is_active(row)
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: int,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = (
        await db.execute(
            select(UserSession).filter(
                UserSession.id == session_id,
                UserSession.user_id == current_user.id,
            )
        )
    ).scalars().first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    current = await session_from_cookie(db, request)
    if current is not None and current.id == session.id:
        clear_refresh_cookie(response)
    if session.revoked_at is None:
        revoke(session)
        await db.commit()
