from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.core.time import UtcDatetime


class UserSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_agent: Optional[str] = None
    created_at: UtcDatetime
    last_used_at: UtcDatetime
    expires_at: UtcDatetime
    # True for the session behind the caller's own refresh cookie.
    current: bool = False
