from app.core.time import UtcDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    # Google photo URLs are pre-signed and can exceed 1k chars, so we
    # use a generous upper bound rather than a tight one.
    image_url: Optional[str] = Field(default=None, max_length=2048)
    is_favorite: bool = False


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    # Google photo URLs are pre-signed and can exceed 1k chars, so we
    # use a generous upper bound rather than a tight one.
    image_url: Optional[str] = Field(default=None, max_length=2048)
    is_favorite: Optional[bool] = None


class ContactResponse(ContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    source: str = "manual"
    google_contact_id: Optional[str] = None
    google_account_id: Optional[int] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class SyncContactsResponse(BaseModel):
    added: int
    updated: int
    total: int
