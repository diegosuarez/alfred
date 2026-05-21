from pydantic import BaseModel, ConfigDict, Field
from app.core.time import UtcDatetime
from typing import Optional


class BoardBase(BaseModel):
    name: str
    description: Optional[str] = None
    # Single emoji used as the board's icon in the sidebar. Cap at 16
    # chars to absorb ZWJ-compound emojis (family, flags, etc.) without
    # letting the user store arbitrary text.
    icon: Optional[str] = Field(default=None, max_length=16)


class BoardCreate(BoardBase):
    # Optional in the schema: when absent, the API assigns the caller's
    # default ("General") context so the legacy single-context flow keeps
    # working with one fewer click.
    context_id: Optional[int] = None


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    context_id: Optional[int] = None
    # An explicit empty string clears the icon back to the default; None
    # (field omitted) leaves it untouched.
    icon: Optional[str] = Field(default=None, max_length=16)


class BoardResponse(BoardBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    context_id: Optional[int] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


from typing import List
from app.schemas.column import ColumnDetailedResponse


class BoardDetailedResponse(BoardResponse):
    columns: List[ColumnDetailedResponse] = []
