from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict


class GoogleAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    scopes: str
    created_at: datetime
    updated_at: datetime


class ConnectGoogleAccountRequest(BaseModel):
    # Extra OAuth scopes the user wants to grant on top of the basic login set
    # (openid email profile). Use Google's documented scope URIs, e.g.
    # https://www.googleapis.com/auth/calendar.readonly
    extra_scopes: List[str] = []


class ConnectGoogleAccountResponse(BaseModel):
    authorize_url: str


class GoogleAccountUpdate(BaseModel):
    # Reserved for future per-account toggles (e.g. friendly label).
    pass
