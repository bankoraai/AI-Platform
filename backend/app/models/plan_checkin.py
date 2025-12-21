from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class PlanCheckIn(Base):
    __tablename__ = "plan_checkins"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("financial_profiles.id"), index=True)
    plan_id_at_checkin: Mapped[int | None] = mapped_column(ForeignKey("generated_plans.id"), nullable=True, index=True)

    # Store the month bucket as a date (YYYY-MM-01) for easy grouping.
    checkin_month: Mapped[date] = mapped_column(Date, index=True)

    cash_available: Mapped[float] = mapped_column(Float, default=0.0)
    stocks_total: Mapped[float] = mapped_column(Float, default=0.0)
    loans_total: Mapped[float] = mapped_column(Float, default=0.0)

    # Optional: store a JSON string snapshot of loans for later analytics.
    loans_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


