from __future__ import annotations

from dataclasses import dataclass

from ..repositories.profiles import FinancialProfileRepository
from ..repositories.users import UserRepository


@dataclass
class ProfileService:
    user_repo: UserRepository
    profile_repo: FinancialProfileRepository

    def upsert_profile(
        self,
        *,
        session,
        mock_user_id: str,
        name: str | None,
        email: str | None,
        cash_available: float,
        stocks_total: float,
        loans: list[dict],
    ):
        if not mock_user_id:
            raise ValueError("mock_user_id is required")
        if cash_available < 0 or stocks_total < 0:
            raise ValueError("cash_available and stocks_total must be >= 0")
        for ln in loans:
            if ln.get("balance", 0) < 0:
                raise ValueError("loan balance must be >= 0")
            apr = float(ln.get("apr_percent", 0))
            if apr < 0 or apr > 100:
                raise ValueError("loan apr_percent must be between 0 and 100")
            if float(ln.get("minimum_payment", 0) or 0) < 0:
                raise ValueError("loan minimum_payment must be >= 0")

        user = self.user_repo.get_or_create(session, mock_user_id=mock_user_id, name=name, email=email)
        profile = self.profile_repo.upsert_for_user(
            session,
            user_id=user.id,
            currency_code=(getattr(user, "preferred_currency", None) or "USD"),
            cash_available=cash_available,
            stocks_total=stocks_total,
            loans=loans,
        )
        return user, profile


