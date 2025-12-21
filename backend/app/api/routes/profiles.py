from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ...dependencies import get_session, get_settings
from ...repositories.profiles import FinancialProfileRepository
from ...repositories.users import UserRepository
from ...schemas.profile import ProfileOut, ProfileUpsertIn, LoanOut
from ...services.profile_service import ProfileService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["profiles"])


def _mock_user_from_headers(
    x_mock_user_id: str | None,
    x_mock_user_name: str | None,
    x_mock_user_email: str | None,
):
    return x_mock_user_id, x_mock_user_name, x_mock_user_email


@router.post("/profiles", response_model=ProfileOut)
def upsert_profile(
    payload: ProfileUpsertIn,
    session: Session = Depends(get_session),
    _settings=Depends(get_settings),
    x_mock_user_id: str | None = Header(default=None),
    x_mock_user_name: str | None = Header(default=None),
    x_mock_user_email: str | None = Header(default=None),
):
    # Header overrides payload (lets frontend omit from body if desired)
    h_id, h_name, h_email = _mock_user_from_headers(x_mock_user_id, x_mock_user_name, x_mock_user_email)
    mock_user_id = (h_id or payload.mock_user_id or "").strip()
    name = (h_name or payload.name)
    email = (h_email or payload.email)

    svc = ProfileService(user_repo=UserRepository(), profile_repo=FinancialProfileRepository())
    try:
        logger.info("profiles.upsert start mock_user_id=%s loans=%s", mock_user_id, len(payload.loans or []))
        user, profile = svc.upsert_profile(
            session=session,
            mock_user_id=mock_user_id,
            name=name,
            email=email,
            cash_available=payload.cash_available,
            stocks_total=payload.stocks_total,
            loans=[ln.model_dump() for ln in payload.loans],
        )
    except ValueError as e:
        logger.warning("profiles.upsert validation_error %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    logger.info("profiles.upsert ok profile_id=%s currency=%s", profile.id, getattr(profile, "currency_code", None))

    return ProfileOut(
        id=profile.id,
        mock_user_id=user.mock_user_id,
        currency_code=(getattr(profile, "currency_code", None) or "USD"),
        cash_available=profile.cash_available,
        stocks_total=profile.stocks_total,
        loans=[
            LoanOut(
                id=ln.id,
                name=ln.name,
                balance=ln.balance,
                apr_percent=ln.apr_percent,
                minimum_payment=ln.minimum_payment,
                term_months=ln.term_months,
            )
            for ln in (profile.loans or [])
        ],
    )


@router.get("/profiles/latest", response_model=ProfileOut)
def get_latest_profile(
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None),
):
    mock_user_id = (x_mock_user_id or "").strip()
    if not mock_user_id:
        raise HTTPException(status_code=400, detail="Missing X-Mock-User-Id header")

    user = UserRepository().get_by_mock_user_id(session, mock_user_id=mock_user_id)
    if not user:
        logger.info("profiles.latest user_not_found mock_user_id=%s", mock_user_id)
        raise HTTPException(status_code=404, detail="User not found")

    profile = FinancialProfileRepository().get_latest_for_user(session, user_id=user.id)
    if not profile:
        logger.info("profiles.latest none user_id=%s", user.id)
        raise HTTPException(status_code=404, detail="No saved profile found")
    logger.info("profiles.latest ok profile_id=%s currency=%s", profile.id, getattr(profile, "currency_code", None))

    return ProfileOut(
        id=profile.id,
        mock_user_id=user.mock_user_id,
        currency_code=(getattr(profile, "currency_code", None) or "USD"),
        cash_available=profile.cash_available,
        stocks_total=profile.stocks_total,
        loans=[
            LoanOut(
                id=ln.id,
                name=ln.name,
                balance=ln.balance,
                apr_percent=ln.apr_percent,
                minimum_payment=ln.minimum_payment,
                term_months=ln.term_months,
            )
            for ln in (profile.loans or [])
        ],
    )


@router.get("/profiles/{profile_id}", response_model=ProfileOut)
def get_profile(profile_id: int, session: Session = Depends(get_session)):
    repo = FinancialProfileRepository()
    profile = repo.get_by_id(session, profile_id=profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Note: user lookup via relationship not loaded; simplest is to use mock id unknown here.
    # For MVP, return empty mock_user_id if not accessible.
    mock_user_id = getattr(profile.user, "mock_user_id", "") if getattr(profile, "user", None) else ""
    return ProfileOut(
        id=profile.id,
        mock_user_id=mock_user_id,
        currency_code=(getattr(profile, "currency_code", None) or "USD"),
        cash_available=profile.cash_available,
        stocks_total=profile.stocks_total,
        loans=[
            LoanOut(
                id=ln.id,
                name=ln.name,
                balance=ln.balance,
                apr_percent=ln.apr_percent,
                minimum_payment=ln.minimum_payment,
                term_months=ln.term_months,
            )
            for ln in (profile.loans or [])
        ],
    )


