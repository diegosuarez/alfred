from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List

from app.schemas.subtask import SubTaskResponse
from app.schemas.tag import TagResponse


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high
    due_date: Optional[datetime] = None
    position: Optional[int] = 0

class TaskCreate(TaskBase):
    # column_id is taken from the URL path; this field is kept for legacy
    # clients that still send it but the handler ignores it.
    column_id: Optional[int] = None
    tag_ids: List[int] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    position: Optional[int] = None
    column_id: Optional[int] = None
    # Absent => no change. Present (even if empty) => replace the full set.
    tag_ids: Optional[List[int]] = None

class TaskResponse(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    column_id: int
    board_id: int
    created_at: datetime
    updated_at: datetime
    total_focus_time: Optional[int] = 0
    tags: List[TagResponse] = []
    subtasks: List[SubTaskResponse] = []

class TaskReorder(BaseModel):
    task_ids: List[int]
    column_id: int
