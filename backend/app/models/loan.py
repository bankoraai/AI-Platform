from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("financial_profiles.id"), index=True)

    name: Mapped[str] = mapped_column(String(200))
    balance: Mapped[float] = mapped_column(Float)
    apr_percent: Mapped[float] = mapped_column(Float)  # 0..100
    minimum_payment: Mapped[float] = mapped_column(Float, default=0.0)
    term_months: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("FinancialProfile", back_populates="loans")


