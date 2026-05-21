from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_favorite: bool = False


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_favorite: Optional[bool] = None


class ContactResponse(ContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
