from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class BoardBase(BaseModel):
    name: str
    description: Optional[str] = None

class BoardCreate(BoardBase):
    pass

class BoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class BoardResponse(BoardBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

from typing import List
from app.schemas.column import ColumnDetailedResponse

class BoardDetailedResponse(BoardResponse):
    columns: List[ColumnDetailedResponse] = []

