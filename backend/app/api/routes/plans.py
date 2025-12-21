from __future__ import annotations

import json
import logging
from datetime import timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ...dependencies import get_session, get_settings
from ...repositories.plans import PlanRepository
from ...repositories.profiles import FinancialProfileRepository
from ...repositories.tasks import PlanTaskRepository
from ...repositories.users import UserRepository
from ...schemas.plan import PlanGenerateIn, PlanOut
from ...services.ngc_provider import NGCProvider
from ...services.wealth_plan_service import WealthPlanService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["plans"])


@router.post("/plans", response_model=PlanOut)
def generate_plan(
    payload: PlanGenerateIn,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    x_mock_user_id: str | None = Header(default=None),
):
    profile = FinancialProfileRepository().get_by_id(session, profile_id=payload.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    ngc = NGCProvider(api_key=settings.ngc_api_key, default_model=settings.ngc_default_model)
    svc = WealthPlanService(ngc=ngc, plan_repo=PlanRepository())
    try:
        currency = (payload.currency_code or "").strip().upper()
        if not currency:
            # Use user preference if available; otherwise default.
            mock_user_id = (x_mock_user_id or "").strip()
            if mock_user_id:
                user = UserRepository().get_by_mock_user_id(session, mock_user_id=mock_user_id)
                currency = (getattr(user, "preferred_currency", None) or "").strip().upper() if user else ""
        if not currency:
            currency = "USD"

        logger.info("plans.generate start profile_id=%s currency=%s", profile.id, currency)
        plan = svc.generate_and_persist(session=session, profile=profile, currency_code=currency)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    created_at = plan.created_at.replace(tzinfo=timezone.utc).isoformat() if plan.created_at else ""
    plan_json = None
    if getattr(plan, "plan_json", None):
        try:
            plan_json = json.loads(plan.plan_json)
        except Exception:
            plan_json = None

    # Seed interactive tasks from the structured plan JSON (if available).
    try:
        steps = []
        if isinstance(plan_json, dict):
            steps = list((plan_json.get("immediate_next_7_days", {}) or {}).get("steps", []) or [])
        if steps:
            PlanTaskRepository().upsert_seed_tasks_from_steps(
                session,
                plan_id=plan.id,
                profile_id=plan.profile_id,
                steps=[str(s) for s in steps],
            )
    except Exception as e:
        # Non-fatal: plan generation should succeed even if task seeding fails.
        logger.warning("plans.generate task_seed_failed plan_id=%s err=%s", getattr(plan, "id", None), e)
    return PlanOut(
        id=plan.id,
        profile_id=plan.profile_id,
        model_used=plan.model_used,
        prompt_hash=plan.prompt_hash,
        plan_text=plan.plan_text,
        plan_json=plan_json,
        created_at=created_at,
    )


@router.get("/plans/latest/{profile_id}", response_model=PlanOut)
def get_latest_plan(profile_id: int, session: Session = Depends(get_session)):
    plan = PlanRepository().get_latest_for_profile(session, profile_id=profile_id)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found")
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


