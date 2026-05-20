from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PATCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    expires_at: Optional[datetime] = None


class PATResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


class PATCreateResponse(PATResponse):
    """Same shape as PATResponse but augmented with the one-shot secret
    that we only return at creation time."""

    token: str
