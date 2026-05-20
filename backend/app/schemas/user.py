from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str | None = None
    user_id: int | None = None
