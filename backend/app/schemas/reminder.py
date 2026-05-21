from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReminderCreate(BaseModel):
    remind_at: datetime


class ReminderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    remind_at: datetime
    created_at: datetime


class PendingReminderResponse(BaseModel):
    """Used by /reminders/pending — folds in the task title so the SPA
    can render the alert without an extra round-trip."""

    id: int
    task_id: int
    task_title: str
    remind_at: datetime
    created_at: datetime
