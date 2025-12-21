from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...dependencies import get_session
from ...repositories.tasks import PlanTaskRepository
from ...schemas.task import TaskOut, TaskPatchIn

logger = logging.getLogger(__name__)
router = APIRouter(tags=["tasks"])


def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc).isoformat()
    return dt.astimezone(timezone.utc).isoformat()


def _parse_iso(value: str | None) -> datetime | None:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {value}") from e
    # Store naive UTC in DB (consistent with existing models using utcnow()).
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _to_out(t) -> TaskOut:
    return TaskOut(
        id=t.id,
        plan_id=t.plan_id,
        profile_id=t.profile_id,
        task_key=t.task_key,
        title=t.title,
        position=t.position,
        due_at=_iso(t.due_at),
        remind_at=_iso(t.remind_at),
        last_reminded_at=_iso(t.last_reminded_at),
        reminder_state=t.reminder_state,
        completed_at=_iso(t.completed_at),
        created_at=_iso(t.created_at) or "",
        updated_at=_iso(t.updated_at) or "",
    )


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    plan_id: int = Query(..., ge=1),
    session: Session = Depends(get_session),
):
    repo = PlanTaskRepository()
    tasks = repo.list_for_plan(session, plan_id=plan_id)
    return [_to_out(t) for t in tasks]


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def patch_task(
    task_id: int,
    payload: TaskPatchIn,
    session: Session = Depends(get_session),
):
    repo = PlanTaskRepository()
    task = repo.get_by_id(session, task_id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if payload.completed is not None:
        task.completed_at = datetime.utcnow() if payload.completed else None
    if payload.due_at is not None:
        task.due_at = _parse_iso(payload.due_at)
    if payload.remind_at is not None:
        task.remind_at = _parse_iso(payload.remind_at)
    session.flush()
    logger.info("tasks.patch ok task_id=%s completed=%s", task_id, bool(task.completed_at))
    return _to_out(task)


