from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional


class ContextBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=16)


class ContextCreate(ContextBase):
    pass


class ContextUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=16)


class ContextResponse(ContextBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
