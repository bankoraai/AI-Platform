from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.plan_task import PlanTask

logger = logging.getLogger(__name__)


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normalize_task_text(text: str) -> str:
    return " ".join((text or "").strip().split()).lower()


class PlanTaskRepository:
    def list_for_plan(self, session: Session, *, plan_id: int) -> list[PlanTask]:
        stmt = select(PlanTask).where(PlanTask.plan_id == plan_id).order_by(PlanTask.position.asc(), PlanTask.id.asc())
        return list(session.execute(stmt).scalars().all())

    def get_by_id(self, session: Session, *, task_id: int) -> PlanTask | None:
        stmt = select(PlanTask).where(PlanTask.id == task_id)
        return session.execute(stmt).scalar_one_or_none()

    def create(
        self,
        session: Session,
        *,
        plan_id: int,
        profile_id: int,
        task_key: str,
        title: str,
        position: int,
        due_at: datetime | None,
        remind_at: datetime | None,
    ) -> PlanTask:
        task = PlanTask(
            plan_id=plan_id,
            profile_id=profile_id,
            task_key=task_key,
            title=title,
            position=position,
            due_at=due_at,
            remind_at=remind_at,
        )
        session.add(task)
        session.flush()
        return task

    def upsert_seed_tasks_from_steps(
        self,
        session: Session,
        *,
        plan_id: int,
        profile_id: int,
        steps: list[str],
        now: datetime | None = None,
    ) -> list[PlanTask]:
        """Create tasks for the 7-day steps if they don't already exist."""
        now = now or datetime.now(timezone.utc)
        existing = {t.task_key for t in self.list_for_plan(session, plan_id=plan_id)}
        created: list[PlanTask] = []

        for idx, raw in enumerate(steps or []):
            title = (raw or "").strip()
            if not title:
                continue
            task_key = _sha256_hex(f"{plan_id}:{idx}:{_normalize_task_text(title)}")
            if task_key in existing:
                continue
            # Simple default: spread due dates across next 7 days.
            due_at = (now + timedelta(days=min(idx + 1, 7))).replace(tzinfo=None)
            remind_at = (now + timedelta(days=min(idx + 1, 7), hours=-2)).replace(tzinfo=None)
            created.append(
                self.create(
                    session,
                    plan_id=plan_id,
                    profile_id=profile_id,
                    task_key=task_key,
                    title=title,
                    position=idx,
                    due_at=due_at,
                    remind_at=remind_at,
                )
            )
            existing.add(task_key)

        logger.info("tasks.seeded plan_id=%s created=%s", plan_id, len(created))
        return created


