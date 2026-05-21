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
