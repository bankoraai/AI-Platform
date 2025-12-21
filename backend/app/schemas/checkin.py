from __future__ import annotations

from pydantic import BaseModel, Field

from .plan import PlanOut


class CheckInLoanBalanceIn(BaseModel):
    id: int = Field(ge=1)
    balance: float = Field(ge=0)


class CheckInCreateIn(BaseModel):
    profile_id: int = Field(ge=1)
    cash_available: float = Field(default=0, ge=0)
    stocks_total: float = Field(default=0, ge=0)
    loans: list[CheckInLoanBalanceIn] = Field(default_factory=list)


class CheckInDeltaOut(BaseModel):
    net_worth_delta: float
    debt_delta: float
    investments_delta: float


class CheckInOut(BaseModel):
    id: int
    profile_id: int
    checkin_month: str
    ahead_behind: str  # ahead|on_track|behind
    deltas: CheckInDeltaOut
    new_plan: PlanOut


class CheckInLatestOut(BaseModel):
    id: int
    profile_id: int
    checkin_month: str
    ahead_behind: str
    deltas: CheckInDeltaOut


