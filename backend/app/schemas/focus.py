from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List

class FocusSessionBase(BaseModel):
    task_id: int
    duration: int  # duration in seconds

class FocusSessionCreate(FocusSessionBase):
    pass

class FocusSessionResponse(FocusSessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime

class DailyFocusStats(BaseModel):
    date: str  # YYYY-MM-DD
    total_seconds: int

class FocusStatsResponse(BaseModel):
    total_focus_time: int  # in seconds
    sessions_completed: int
    daily_stats: List[DailyFocusStats]
