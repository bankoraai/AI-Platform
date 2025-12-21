from __future__ import annotations

from pydantic import BaseModel, Field


class LoanIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    balance: float = Field(ge=0)
    apr_percent: float = Field(ge=0, le=100)
    minimum_payment: float = Field(default=0, ge=0)
    term_months: int | None = Field(default=None, ge=1)


class ProfileUpsertIn(BaseModel):
    # Frontend-only mock sign-in identifier. May also be sent via header.
    mock_user_id: str = Field(min_length=1, max_length=64)
    name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=320)

    cash_available: float = Field(default=0, ge=0)
    stocks_total: float = Field(default=0, ge=0)
    loans: list[LoanIn] = Field(default_factory=list)


class LoanOut(BaseModel):
    id: int
    name: str
    balance: float
    apr_percent: float
    minimum_payment: float
    term_months: int | None


class ProfileOut(BaseModel):
    id: int
    mock_user_id: str
    currency_code: str
    cash_available: float
    stocks_total: float
    loans: list[LoanOut]


