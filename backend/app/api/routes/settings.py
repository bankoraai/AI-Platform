from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ...dependencies import get_session
from ...repositories.profiles import FinancialProfileRepository
from ...repositories.users import UserRepository
from ...schemas.settings import SettingsOut, SettingsUpdateIn
from ...services.fx_rates import fx_rates


router = APIRouter(tags=["settings"])
logger = logging.getLogger(__name__)

SUPPORTED_CURRENCIES = {"USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "AED", "SAR", "NIS"}


@router.get("/settings", response_model=SettingsOut)
def get_settings(
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None),
):
    mock_user_id = (x_mock_user_id or "").strip()
    if not mock_user_id:
        raise HTTPException(status_code=400, detail="Missing X-Mock-User-Id header")

    user = UserRepository().get_by_mock_user_id(session, mock_user_id=mock_user_id)
    if not user:
        logger.info("settings.get user_not_found mock_user_id=%s", mock_user_id)
        raise HTTPException(status_code=404, detail="User not found")

    logger.info("settings.get ok mock_user_id=%s currency=%s", mock_user_id, (user.preferred_currency or "USD"))
    return SettingsOut(preferred_currency=(user.preferred_currency or "USD"))


@router.put("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdateIn,
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None),
):
    mock_user_id = (x_mock_user_id or "").strip()
    if not mock_user_id:
        raise HTTPException(status_code=400, detail="Missing X-Mock-User-Id header")

    user = UserRepository().get_by_mock_user_id(session, mock_user_id=mock_user_id)
    if not user:
        logger.info("settings.put user_not_found mock_user_id=%s", mock_user_id)
        raise HTTPException(status_code=404, detail="User not found")

    currency = (payload.preferred_currency or "").strip().upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Unsupported currency: {currency}")

    logger.info("settings.put start mock_user_id=%s currency=%s", mock_user_id, currency)
    user.preferred_currency = currency
    session.flush()

    # Convert latest saved profile amounts into the new currency (if needed).
    profile_repo = FinancialProfileRepository()
    profile = profile_repo.get_latest_for_user(session, user_id=user.id)
    if profile:
        from_code = (getattr(profile, "currency_code", None) or "USD").strip().upper()
        to_code = currency
        if from_code != to_code:
            try:
                rate = fx_rates.get_rate(from_currency=from_code, to_currency=to_code)
            except Exception as e:
                logger.warning("settings.put fx_failed from=%s to=%s err=%s", from_code, to_code, e)
                raise HTTPException(status_code=502, detail=f"FX rate lookup failed: {e}")

            logger.info("settings.put converting profile_id=%s from=%s to=%s rate=%s", profile.id, from_code, to_code, rate)
            profile.cash_available = float(profile.cash_available or 0.0) * rate
            profile.stocks_total = float(profile.stocks_total or 0.0) * rate
            for ln in (profile.loans or []):
                ln.balance = float(ln.balance or 0.0) * rate
                ln.minimum_payment = float(ln.minimum_payment or 0.0) * rate
            profile.currency_code = to_code
            session.flush()

    logger.info("settings.put ok mock_user_id=%s currency=%s", mock_user_id, currency)
    return SettingsOut(preferred_currency=currency)


