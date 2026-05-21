from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.tag import TagResponse


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high
    due_date: Optional[datetime] = None
    position: Optional[int] = 0


class TaskCreate(TaskBase):
    # column_id is taken from the URL path; the field is kept here so
    # legacy clients that still send it don't get a 422.
    column_id: Optional[int] = None
    # When set, the new task is created as a child of parent_task_id.
    parent_task_id: Optional[int] = None
    tag_ids: List[int] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    position: Optional[int] = None
    column_id: Optional[int] = None
    completed: Optional[bool] = None
    # Use 0 as the "detach from parent" sentinel (same trick we use for
    # context.google_account_id) — JSON can't distinguish absent from null
    # in our naive update flow.
    parent_task_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None


class TaskResponse(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    column_id: int
    board_id: int
    parent_task_id: Optional[int] = None
    completed: bool = False
    created_at: datetime
    updated_at: datetime
    total_focus_time: Optional[int] = 0
    tags: List[TagResponse] = []
    # Direct children only — we don't recurse beyond one level here to
    # keep eager-load chains bounded.
    children: List["TaskResponse"] = []


# Resolve the forward reference for the recursive children list.
TaskResponse.model_rebuild()


class TaskReorder(BaseModel):
    task_ids: List[int]
    column_id: int
