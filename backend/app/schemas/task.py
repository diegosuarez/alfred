from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high
    due_date: Optional[datetime] = None
    position: Optional[int] = 0

class TaskCreate(TaskBase):
    column_id: int

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    position: Optional[int] = None
    column_id: Optional[int] = None

class TaskResponse(TaskBase):
    id: int
    column_id: int
    board_id: int
    created_at: datetime
    updated_at: datetime
    total_focus_time: Optional[int] = 0

    class Config:
        from_attributes = True

class TaskReorder(BaseModel):
    task_ids: List[int]
    column_id: int
