from app.core.time import UtcDatetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.contact import ContactResponse
from app.schemas.reminder import ReminderResponse
from app.schemas.tag import TagResponse


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high
    due_date: Optional[UtcDatetime] = None
    position: Optional[int] = 0


class TaskCreate(TaskBase):
    # column_id is taken from the URL path; the field is kept here so
    # legacy clients that still send it don't get a 422.
    column_id: Optional[int] = None
    # When set, the new task is created as a child of parent_task_id.
    parent_task_id: Optional[int] = None
    tag_ids: List[int] = []
    requester_id: Optional[int] = None
    assignee_ids: List[int] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[UtcDatetime] = None
    position: Optional[int] = None
    column_id: Optional[int] = None
    completed: Optional[bool] = None
    # Setting to True archives the task and (recursively) its children.
    # Setting to False restores it and its children.
    archived: Optional[bool] = None
    # Use 0 as the "detach from parent" sentinel (same trick we use for
    # context.google_account_id) — JSON can't distinguish absent from null
    # in our naive update flow.
    parent_task_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    # Same 0-sentinel trick for requester. None = no change, 0 = detach,
    # positive int = set to that contact.
    requester_id: Optional[int] = None
    # Absent => no change. [] clears all. Non-empty replaces the set.
    assignee_ids: Optional[List[int]] = None


class TaskChildResponse(TaskBase):
    """Shallow child task — no `children` field on purpose so eager-load
    chains stay bounded. The SPA drills deeper by re-rendering a child
    as the current task (via GET /tasks/{id} or refreshing the board)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    column_id: int
    board_id: int
    parent_task_id: Optional[int] = None
    completed: bool = False
    archived_at: Optional[UtcDatetime] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    total_focus_time: Optional[int] = 0
    tags: List[TagResponse] = []
    requester: Optional[ContactResponse] = None
    assignees: List[ContactResponse] = []
    reminders: List[ReminderResponse] = []


class TaskResponse(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    column_id: int
    board_id: int
    parent_task_id: Optional[int] = None
    completed: bool = False
    archived_at: Optional[UtcDatetime] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime
    total_focus_time: Optional[int] = 0
    tags: List[TagResponse] = []
    requester: Optional[ContactResponse] = None
    assignees: List[ContactResponse] = []
    reminders: List[ReminderResponse] = []
    children: List[TaskChildResponse] = []


class ArchiveResultResponse(BaseModel):
    archived: int


class TaskReorder(BaseModel):
    task_ids: List[int]
    column_id: int
