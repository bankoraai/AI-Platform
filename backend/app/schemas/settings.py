from __future__ import annotations

from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    preferred_currency: str


class SettingsUpdateIn(BaseModel):
    preferred_currency: str = Field(min_length=3, max_length=3)


