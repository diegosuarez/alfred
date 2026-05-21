from pydantic import BaseModel, ConfigDict
from app.core.time import UtcDatetime
from typing import Optional, List

class ColumnBase(BaseModel):
    name: str
    position: Optional[int] = 0

class ColumnCreate(ColumnBase):
    pass

class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None

class ColumnResponse(ColumnBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    board_id: int
    created_at: UtcDatetime
    updated_at: UtcDatetime

class ColumnReorder(BaseModel):
    column_ids: List[int]

from app.schemas.task import TaskResponse

class ColumnDetailedResponse(ColumnResponse):
    tasks: List[TaskResponse] = []

