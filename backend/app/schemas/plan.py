from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PlanGenerateIn(BaseModel):
    profile_id: int = Field(ge=1)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)


class PlanOut(BaseModel):
    id: int
    profile_id: int
    model_used: str
    prompt_hash: str
    plan_text: str
    plan_json: dict[str, Any] | None = None
    created_at: str


