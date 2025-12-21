from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.generated_plan import GeneratedPlan

logger = logging.getLogger(__name__)

class PlanRepository:
    def create(
        self,
        session: Session,
        profile_id: int,
        model_used: str,
        prompt_hash: str,
        plan_text: str,
        plan_json: str | None = None,
        parent_plan_id: int | None = None,
    ) -> GeneratedPlan:
        logger.info("plans_repo.create profile_id=%s has_json=%s", profile_id, bool(plan_json))
        plan = GeneratedPlan(
            profile_id=profile_id,
            parent_plan_id=parent_plan_id,
            model_used=model_used,
            prompt_hash=prompt_hash,
            plan_text=plan_text,
            plan_json=plan_json,
        )
        session.add(plan)
        session.flush()
        return plan

    def get_latest_for_profile(self, session: Session, profile_id: int) -> GeneratedPlan | None:
        # NOTE: order_by() alone does not constrain cardinality. We must LIMIT 1
        # to avoid MultipleResultsFound when a profile has multiple plans.
        logger.debug("plans_repo.get_latest_for_profile profile_id=%s", profile_id)
        stmt = (
            select(GeneratedPlan)
            .where(GeneratedPlan.profile_id == profile_id)
            .order_by(GeneratedPlan.created_at.desc(), GeneratedPlan.id.desc())
            .limit(1)
        )
        return session.execute(stmt).scalars().first()


