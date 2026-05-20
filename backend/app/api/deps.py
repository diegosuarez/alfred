import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.pat import PAT_PREFIX, extract_lookup_prefix, hash_token
from app.core.security import decode_access_token
from app.core.time import utcnow
from app.database import get_db
from app.models.personal_access_token import PersonalAccessToken
from app.models.user import User
from app.schemas.user import TokenData

# Matches the login endpoint URL (absolute path so Swagger's Authorize works)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def _user_from_pat(token: str, db: AsyncSession) -> User | None:
    """Resolve a Bearer PAT to a user, or None if it isn't valid.
    Updates last_used_at as a side effect (best-effort)."""
    lookup_prefix = extract_lookup_prefix(token)
    if lookup_prefix is None:
        return None

    result = await db.execute(
        select(PersonalAccessToken).filter(
            PersonalAccessToken.prefix == lookup_prefix
        )
    )
    pat = result.scalars().first()
    if pat is None or pat.revoked_at is not None:
        return None

    # Constant-time hash comparison.
    if not secrets.compare_digest(pat.token_hash, hash_token(token)):
        return None

    if pat.expires_at is not None:
        # SQLite drops tz info on the way out, so normalize before comparing.
        # Both sides are UTC by project convention.
        now_naive = utcnow().replace(tzinfo=None)
        if pat.expires_at < now_naive:
            return None

    user_result = await db.execute(select(User).filter(User.id == pat.user_id))
    user = user_result.scalars().first()
    if user is None:
        return None

    pat.last_used_at = utcnow()
    await db.commit()
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Distinct prefix lets us short-circuit JWT parsing for PATs.
    if token.startswith(PAT_PREFIX):
        user = await _user_from_pat(token, db)
        if user is None:
            raise credentials_exception
        return user

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    email: str = payload.get("sub")
    user_id: int = payload.get("user_id")
    if email is None or user_id is None:
        raise credentials_exception

    token_data = TokenData(email=email, user_id=user_id)

    result = await db.execute(select(User).filter(User.id == token_data.user_id))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception

    return user
