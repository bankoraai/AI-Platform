from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.plan_checkin import PlanCheckIn

logger = logging.getLogger(__name__)


class PlanCheckInRepository:
    def get_latest_for_profile(self, session: Session, *, profile_id: int) -> PlanCheckIn | None:
        stmt = (
            select(PlanCheckIn)
            .where(PlanCheckIn.profile_id == profile_id)
            .order_by(PlanCheckIn.checkin_month.desc(), PlanCheckIn.id.desc())
            .limit(1)
        )
        return session.execute(stmt).scalars().first()

    def create(
        self,
        session: Session,
        *,
        profile_id: int,
        plan_id_at_checkin: int | None,
        checkin_month: date,
        cash_available: float,
        stocks_total: float,
        loans_total: float,
        loans_json: str | None,
    ) -> PlanCheckIn:
        row = PlanCheckIn(
            profile_id=profile_id,
            plan_id_at_checkin=plan_id_at_checkin,
            checkin_month=checkin_month,
            cash_available=float(cash_available or 0.0),
            stocks_total=float(stocks_total or 0.0),
            loans_total=float(loans_total or 0.0),
            loans_json=loans_json,
        )
        session.add(row)
        session.flush()
        logger.info("checkins.created id=%s profile_id=%s month=%s", row.id, profile_id, checkin_month)
        return row


