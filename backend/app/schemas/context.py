from pydantic import BaseModel, ConfigDict, Field
from app.core.time import UtcDatetime
from typing import Optional


class ContextBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=16)


class ContextCreate(ContextBase):
    google_account_id: Optional[int] = None


class ContextUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=16)
    # Set to a positive int to attach, set to 0 to detach (Pydantic does
    # not distinguish "absent" from "null" in a regular JSON body, so we
    # use 0 as the sentinel for "clear").
    google_account_id: Optional[int] = None


class ContextResponse(ContextBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    google_account_id: Optional[int] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
