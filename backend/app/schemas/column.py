from pydantic import BaseModel
from datetime import datetime
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
    id: int
    board_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ColumnReorder(BaseModel):
    column_ids: List[int]

from app.schemas.task import TaskResponse

class ColumnDetailedResponse(ColumnResponse):
    tasks: List[TaskResponse] = []

