from pydantic import BaseModel, ConfigDict
from app.core.time import UtcDatetime
from typing import List

class FocusSessionBase(BaseModel):
    task_id: int
    duration: int  # duration in seconds

class FocusSessionCreate(FocusSessionBase):
    pass

class FocusSessionResponse(FocusSessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: UtcDatetime

class DailyFocusStats(BaseModel):
    date: str  # YYYY-MM-DD
    total_seconds: int

class FocusStatsResponse(BaseModel):
    total_focus_time: int  # in seconds
    sessions_completed: int
    daily_stats: List[DailyFocusStats]
