from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.schemas.user import TokenData

# Matches the login endpoint URL (absolute path so Swagger's Authorize works)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
        
    email: str = payload.get("sub")
    user_id: int = payload.get("user_id")
    if email is None or user_id is None:
        raise credentials_exception
        
    token_data = TokenData(email=email, user_id=user_id)
    
    # Select user from SQLite
    result = await db.execute(select(User).filter(User.id == token_data.user_id))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
        
    return user
