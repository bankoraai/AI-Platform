from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models.financial_profile import FinancialProfile
from ..models.loan import Loan
from ..models.user import User

logger = logging.getLogger(__name__)

class FinancialProfileRepository:
    def get_latest_for_user(self, session: Session, user_id: int) -> FinancialProfile | None:
        # ORDER BY alone does not constrain result cardinality. LIMIT 1 makes it safe and deterministic.
        logger.debug("profiles_repo.get_latest_for_user user_id=%s", user_id)
        stmt = (
            select(FinancialProfile)
            .where(FinancialProfile.user_id == user_id)
            .options(selectinload(FinancialProfile.loans))
            .order_by(FinancialProfile.updated_at.desc(), FinancialProfile.id.desc())
            .limit(1)
        )
        return session.execute(stmt).scalars().first()

    def get_by_id(self, session: Session, profile_id: int) -> FinancialProfile | None:
        stmt = (
            select(FinancialProfile)
            .where(FinancialProfile.id == profile_id)
            .options(selectinload(FinancialProfile.loans), selectinload(FinancialProfile.user))
        )
        return session.execute(stmt).scalar_one_or_none()

    def upsert_for_user(
        self,
        session: Session,
        user_id: int,
        currency_code: str,
        cash_available: float,
        stocks_total: float,
        loans: list[dict],
    ) -> FinancialProfile:
        profile = self.get_latest_for_user(session, user_id)
        if not profile:
            profile = FinancialProfile(
                user_id=user_id,
                currency_code=(currency_code or "USD").strip().upper(),
                cash_available=cash_available,
                stocks_total=stocks_total,
            )
            session.add(profile)
            session.flush()
        else:
            profile.currency_code = (currency_code or profile.currency_code or "USD").strip().upper()
            profile.cash_available = cash_available
            profile.stocks_total = stocks_total
            # Replace loans (simple MVP approach)
            profile.loans.clear()

        for ln in loans:
            profile.loans.append(
                Loan(
                    name=ln["name"],
                    balance=float(ln["balance"]),
                    apr_percent=float(ln["apr_percent"]),
                    minimum_payment=float(ln.get("minimum_payment", 0.0) or 0.0),
                    term_months=ln.get("term_months"),
                )
            )

        session.flush()
        return profile


