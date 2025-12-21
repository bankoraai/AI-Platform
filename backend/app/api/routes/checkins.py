from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...dependencies import get_session, get_settings
from ...repositories.checkins import PlanCheckInRepository
from ...repositories.plans import PlanRepository
from ...repositories.profiles import FinancialProfileRepository
from ...repositories.tasks import PlanTaskRepository
from ...schemas.checkin import CheckInCreateIn, CheckInDeltaOut, CheckInLatestOut, CheckInOut
from ...schemas.plan import PlanOut
from ...services.ngc_provider import NGCProvider
from ...services.wealth_plan_service import WealthPlanService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["checkins"])


def _month_bucket(now: datetime) -> date:
    d = now.date()
    return date(d.year, d.month, 1)


def _net_worth(*, cash: float, stocks: float, loans_total: float) -> float:
    return float(cash or 0.0) + float(stocks or 0.0) - float(loans_total or 0.0)


def _classify(*, net_worth_delta: float, debt_delta: float, investments_delta: float) -> str:
    # debt_delta: positive means debt increased (worse), negative means debt decreased (better)
    if net_worth_delta < 0 or debt_delta > 0:
        return "behind"
    if net_worth_delta > 0 and (debt_delta < 0 or investments_delta > 0):
        return "ahead"
    return "on_track"


def _plan_out_from_model(plan) -> PlanOut:
    created_at = plan.created_at.replace(tzinfo=timezone.utc).isoformat() if plan.created_at else ""
    plan_json = None
    if getattr(plan, "plan_json", None):
        try:
            plan_json = json.loads(plan.plan_json)
        except Exception:
            plan_json = None
    return PlanOut(
        id=plan.id,
        profile_id=plan.profile_id,
        model_used=plan.model_used,
        prompt_hash=plan.prompt_hash,
        plan_text=plan.plan_text,
        plan_json=plan_json,
        created_at=created_at,
    )


@router.get("/checkins/latest", response_model=CheckInLatestOut)
def get_latest_checkin(
    profile_id: int = Query(..., ge=1),
    session: Session = Depends(get_session),
):
    repo = PlanCheckInRepository()
    latest = repo.get_latest_for_profile(session, profile_id=profile_id)
    if not latest:
        raise HTTPException(status_code=404, detail="No check-in found")

    # Compute deltas vs previous check-in if present.
    stmt_prev = (
        select(type(latest))
        .where(type(latest).profile_id == profile_id)
        .where(type(latest).id != latest.id)
        .order_by(type(latest).checkin_month.desc(), type(latest).id.desc())
        .limit(1)
    )
    prev = session.execute(stmt_prev).scalars().first()
    prev_cash = float(getattr(prev, "cash_available", 0.0) or 0.0) if prev else 0.0
    prev_stocks = float(getattr(prev, "stocks_total", 0.0) or 0.0) if prev else 0.0
    prev_loans = float(getattr(prev, "loans_total", 0.0) or 0.0) if prev else 0.0

    net_now = _net_worth(cash=latest.cash_available, stocks=latest.stocks_total, loans_total=latest.loans_total)
    net_prev = _net_worth(cash=prev_cash, stocks=prev_stocks, loans_total=prev_loans)
    deltas = CheckInDeltaOut(
        net_worth_delta=float(net_now - net_prev),
        debt_delta=float(float(latest.loans_total or 0.0) - prev_loans),
        investments_delta=float(float(latest.stocks_total or 0.0) - prev_stocks),
    )
    status = _classify(
        net_worth_delta=deltas.net_worth_delta,
        debt_delta=deltas.debt_delta,
        investments_delta=deltas.investments_delta,
    )
    return CheckInLatestOut(
        id=latest.id,
        profile_id=latest.profile_id,
        checkin_month=str(latest.checkin_month),
        ahead_behind=status,
        deltas=deltas,
    )


@router.post("/checkins", response_model=CheckInOut)
def create_checkin(
    payload: CheckInCreateIn,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
):
    profile_repo = FinancialProfileRepository()
    plan_repo = PlanRepository()
    tasks_repo = PlanTaskRepository()
    checkin_repo = PlanCheckInRepository()

    profile = profile_repo.get_by_id(session, profile_id=payload.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Update stored profile balances to the new month snapshot (this is the “re-enter balances” loop).
    profile.cash_available = float(payload.cash_available or 0.0)
    profile.stocks_total = float(payload.stocks_total or 0.0)
    loan_by_id = {ln.id: ln for ln in (profile.loans or [])}
    for ln in payload.loans or []:
        target = loan_by_id.get(int(ln.id))
        if target:
            target.balance = float(ln.balance or 0.0)
    session.flush()

    loans_total = float(sum(float(ln.balance or 0.0) for ln in (profile.loans or [])) or 0.0)
    now = datetime.now(timezone.utc)
    month = _month_bucket(now)

    prev = checkin_repo.get_latest_for_profile(session, profile_id=profile.id)
    prev_cash = float(getattr(prev, "cash_available", 0.0) or 0.0) if prev else 0.0
    prev_stocks = float(getattr(prev, "stocks_total", 0.0) or 0.0) if prev else 0.0
    prev_loans = float(getattr(prev, "loans_total", 0.0) or 0.0) if prev else 0.0

    net_now = _net_worth(cash=profile.cash_available, stocks=profile.stocks_total, loans_total=loans_total)
    net_prev = _net_worth(cash=prev_cash, stocks=prev_stocks, loans_total=prev_loans)
    deltas = CheckInDeltaOut(
        net_worth_delta=float(net_now - net_prev),
        debt_delta=float(loans_total - prev_loans),
        investments_delta=float(profile.stocks_total - prev_stocks),
    )
    status = _classify(
        net_worth_delta=deltas.net_worth_delta,
        debt_delta=deltas.debt_delta,
        investments_delta=deltas.investments_delta,
    )

    loans_json = json.dumps(
        [{"id": ln.id, "name": ln.name, "balance": float(ln.balance or 0.0)} for ln in (profile.loans or [])],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    latest_plan = plan_repo.get_latest_for_profile(session, profile_id=profile.id)
    row = checkin_repo.create(
        session,
        profile_id=profile.id,
        plan_id_at_checkin=(latest_plan.id if latest_plan else None),
        checkin_month=month,
        cash_available=profile.cash_available,
        stocks_total=profile.stocks_total,
        loans_total=loans_total,
        loans_json=loans_json,
    )

    # Regenerate a new plan using progress context (completed vs pending tasks + month deltas).
    parent = latest_plan
    completed: list[str] = []
    pending: list[str] = []
    prev_plan_json_obj: dict | None = None
    if parent:
        try:
            prev_plan_json_obj = json.loads(parent.plan_json) if getattr(parent, "plan_json", None) else None
        except Exception:
            prev_plan_json_obj = None
        for t in tasks_repo.list_for_plan(session, plan_id=parent.id):
            (completed if t.completed_at else pending).append(t.title)

    ngc = NGCProvider(api_key=settings.ngc_api_key, default_model=settings.ngc_default_model)
    svc = WealthPlanService(ngc=ngc, plan_repo=plan_repo)
    new_plan = svc.regenerate_from_progress(
        session=session,
        profile=profile,
        currency_code=(getattr(profile, "currency_code", None) or "USD"),
        parent_plan_id=(parent.id if parent else None),
        previous_plan_json=prev_plan_json_obj,
        completed_tasks=completed,
        pending_tasks=pending,
        deltas=deltas.model_dump(),
    )

    # Seed tasks for the new plan.
    try:
        parsed = json.loads(new_plan.plan_json) if getattr(new_plan, "plan_json", None) else None
        steps = []
        if isinstance(parsed, dict):
            steps = list((parsed.get("immediate_next_7_days", {}) or {}).get("steps", []) or [])
        if steps:
            tasks_repo.upsert_seed_tasks_from_steps(
                session,
                plan_id=new_plan.id,
                profile_id=new_plan.profile_id,
                steps=[str(s) for s in steps],
            )
    except Exception as e:
        logger.warning("checkins.seed_tasks_failed plan_id=%s err=%s", getattr(new_plan, "id", None), e)

    return CheckInOut(
        id=row.id,
        profile_id=row.profile_id,
        checkin_month=str(row.checkin_month),
        ahead_behind=status,
        deltas=deltas,
        new_plan=_plan_out_from_model(new_plan),
    )


