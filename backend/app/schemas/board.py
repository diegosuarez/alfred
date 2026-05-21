from pydantic import BaseModel, ConfigDict
from app.core.time import UtcDatetime
from typing import Optional


class BoardBase(BaseModel):
    name: str
    description: Optional[str] = None


class BoardCreate(BoardBase):
    # Optional in the schema: when absent, the API assigns the caller's
    # default ("General") context so the legacy single-context flow keeps
    # working with one fewer click.
    context_id: Optional[int] = None


class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    context_id: Optional[int] = None


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
