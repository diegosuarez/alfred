from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SubTaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class SubTaskCreate(SubTaskBase):
    pass


class SubTaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    completed: Optional[bool] = None
    position: Optional[int] = None


class SubTaskResponse(SubTaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    completed: bool
    position: int
    created_at: datetime
    updated_at: datetime
