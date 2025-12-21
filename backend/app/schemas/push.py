from __future__ import annotations

from pydantic import BaseModel, Field


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(min_length=10)
    p256dh: str = Field(min_length=1, max_length=300)
    auth: str = Field(min_length=1, max_length=300)
    user_agent: str | None = Field(default=None, max_length=400)


class PushSubscribeOut(BaseModel):
    id: int
    endpoint: str
    disabled: bool


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=10)


