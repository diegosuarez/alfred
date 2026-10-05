"""Remember-me sessions: refresh-token cookie + JWT issuance.

Every login path calls `issue_login`. Without `remember` it returns a
plain access JWT, as before. With it, it also opens a UserSession,
sets the refresh cookie and embeds the session id (`sid`) in the JWT
so revoking the session cuts off its access tokens right away.
"""
import secrets
from datetime import timedelta

from fastapi import Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.pat import hash_token
from app.core.security import create_access_token
from app.core.time import utcnow
from app.models.user import User
from app.models.user_session import UserSession

REFRESH_COOKIE = "alfred_refresh"
# Only the /api/auth endpoints (refresh, logout, sessions) ever see it.
REFRESH_COOKIE_PATH = "/api/auth"
SESSION_LIFETIME = timedelta(days=90)
_USER_AGENT_MAX_LEN = 512


def _now_naive():
    # SQLite drops tzinfo, so compare against naive UTC.
    return utcnow().replace(tzinfo=None)


def access_token_for(user: User, session: UserSession | None = None) -> str:
    data = {"sub": user.email, "user_id": user.id}
    if session is not None:
        data["sid"] = session.id
    return create_access_token(data=data)


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        # Lax rather than Strict so the cookie set on the Google
        # callback (a cross-site navigation) is kept. Refresh/logout
        # are POSTs, which Lax never sends cross-site anyway.
        samesite="lax",
        secure=settings.APP_URL.startswith("https://"),
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


async def open_session(
    db: AsyncSession, user: User, request: Request
) -> tuple[UserSession, str]:
    """Persist a new remembered session. Returns it with the plaintext
    refresh token, which only ever leaves the server in the cookie."""
    token = secrets.token_urlsafe(32)
    now = _now_naive()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        user_agent=(request.headers.get("user-agent") or "")[:_USER_AGENT_MAX_LEN] or None,
        created_at=now,
        last_used_at=now,
        expires_at=now + SESSION_LIFETIME,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session, token


async def issue_login(
    db: AsyncSession,
    user: User,
    remember: bool,
    request: Request,
    response: Response,
) -> str:
    """Return the access JWT for a fresh login, opening a remembered
    session (and setting its cookie on `response`) when asked."""
    if not remember:
        return access_token_for(user)
    session, token = await open_session(db, user, request)
    set_refresh_cookie(response, token)
    return access_token_for(user, session)


async def session_from_cookie(
    db: AsyncSession, request: Request
) -> UserSession | None:
    """The live (not revoked, not expired) session behind the request's
    refresh cookie, if any."""
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        return None
    session = (
        await db.execute(
            select(UserSession).filter(UserSession.token_hash == hash_token(token))
        )
    ).scalars().first()
    if session is None or not is_active(session):
        return None
    return session


def is_active(session: UserSession) -> bool:
    return session.revoked_at is None and session.expires_at > _now_naive()


def touch(session: UserSession) -> None:
    """Slide the expiry window forward on use."""
    now = _now_naive()
    session.last_used_at = now
    session.expires_at = now + SESSION_LIFETIME


def revoke(session: UserSession) -> None:
    session.revoked_at = _now_naive()
