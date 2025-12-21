from __future__ import annotations

from pydantic import BaseModel, Field


class TaskOut(BaseModel):
    id: int
    plan_id: int
    profile_id: int
    task_key: str
    title: str
    position: int

    due_at: str | None = None
    remind_at: str | None = None
    last_reminded_at: str | None = None
    reminder_state: str
    completed_at: str | None = None
    created_at: str
    updated_at: str


class TaskPatchIn(BaseModel):
    completed: bool | None = None
    due_at: str | None = Field(default=None, description="ISO8601 datetime; null clears the due date.")
    remind_at: str | None = Field(default=None, description="ISO8601 datetime; null clears the reminder time.")


