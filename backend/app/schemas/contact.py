from app.core.time import UtcDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    # Strict EmailStr on user-facing input; the Response below loosens it
    # so Google-imported rows with quirky email-shaped strings never break
    # serialization.
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


class ContactResponse(BaseModel):
    """Output schema — tolerant of legacy / synced data. We use `str` for
    email instead of EmailStr so a malformed value imported from Google
    People doesn't 500 the contacts listing."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    email: Optional[str] = None
    image_url: Optional[str] = None
    is_favorite: bool = False
    id: int
    user_id: int
    is_self: bool = False
    source: str = "manual"
    google_contact_id: Optional[str] = None
    google_account_id: Optional[int] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


class SyncContactsResponse(BaseModel):
    added: int
    updated: int
    total: int
