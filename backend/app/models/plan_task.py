from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class PlanTask(Base):
    __tablename__ = "plan_tasks"
    __table_args__ = (UniqueConstraint("plan_id", "task_key", name="uq_plan_tasks_plan_task_key"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("generated_plans.id"), index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("financial_profiles.id"), index=True)

    # Stable identifier derived from plan + position + normalized text.
    task_key: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=0)

    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    remind_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    last_reminded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reminder_state: Mapped[str] = mapped_column(String(30), default="pending")  # pending|sent|disabled

    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


