from app.core.time import UtcDatetime

from pydantic import BaseModel, ConfigDict


class ReminderCreate(BaseModel):
    remind_at: UtcDatetime


class ReminderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    remind_at: UtcDatetime
    created_at: UtcDatetime


class PendingReminderResponse(BaseModel):
    """Used by /reminders/pending — folds in the task title so the SPA
    can render the alert without an extra round-trip."""

    id: int
    task_id: int
    task_title: str
    remind_at: UtcDatetime
    created_at: UtcDatetime
