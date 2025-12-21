from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class GeneratedPlan(Base):
    __tablename__ = "generated_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("financial_profiles.id"), index=True)
    # For regenerated plans (monthly check-ins / refresh), link back to the prior plan.
    parent_plan_id: Mapped[int | None] = mapped_column(ForeignKey("generated_plans.id"), nullable=True, index=True)

    model_used: Mapped[str] = mapped_column(String(200))
    prompt_hash: Mapped[str] = mapped_column(String(64), index=True)
    plan_text: Mapped[str] = mapped_column(Text)
    # JSON string (strict structured plan). Kept separate from plan_text for backward compatibility.
    plan_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    profile = relationship("FinancialProfile", back_populates="plans")
    parent_plan = relationship("GeneratedPlan", remote_side="GeneratedPlan.id", uselist=False)


