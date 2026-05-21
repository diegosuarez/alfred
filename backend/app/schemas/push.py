from pydantic import BaseModel


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


class PushSubscribeResponse(BaseModel):
    id: int


class VapidPublicKeyResponse(BaseModel):
    public_key: str
