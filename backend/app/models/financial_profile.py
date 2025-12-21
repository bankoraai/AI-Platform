from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class FinancialProfile(Base):
    __tablename__ = "financial_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    cash_available: Mapped[float] = mapped_column(Float, default=0.0)
    stocks_total: Mapped[float] = mapped_column(Float, default=0.0)
    currency_code: Mapped[str] = mapped_column(String(3), default="USD")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="profiles")
    loans = relationship("Loan", back_populates="profile", cascade="all, delete-orphan")
    plans = relationship("GeneratedPlan", back_populates="profile", cascade="all, delete-orphan")


