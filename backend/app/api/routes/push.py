from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ...dependencies import get_session, get_settings
from ...repositories.push_subscriptions import PushSubscriptionRepository
from ...repositories.users import UserRepository
from ...schemas.push import PushSubscribeIn, PushSubscribeOut, PushUnsubscribeIn

logger = logging.getLogger(__name__)
router = APIRouter(tags=["push"])


@router.post("/push/subscribe", response_model=PushSubscribeOut)
def subscribe(
    payload: PushSubscribeIn,
    session: Session = Depends(get_session),
    _settings=Depends(get_settings),
    x_mock_user_id: str | None = Header(default=None),
):
    mock_user_id = (x_mock_user_id or "").strip()
    if not mock_user_id:
        raise HTTPException(status_code=400, detail="Missing X-Mock-User-Id header")

    user = UserRepository().get_by_mock_user_id(session, mock_user_id=mock_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    repo = PushSubscriptionRepository()
    row = repo.upsert(
        session,
        user_id=user.id,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth,
        user_agent=payload.user_agent,
    )
    row.last_seen_at = datetime.utcnow()
    session.flush()
    logger.info("push.subscribe ok user_id=%s sub_id=%s", user.id, row.id)
    return PushSubscribeOut(id=row.id, endpoint=row.endpoint, disabled=bool(row.disabled_at))


@router.post("/push/unsubscribe")
def unsubscribe(
    payload: PushUnsubscribeIn,
    session: Session = Depends(get_session),
):
    ok = PushSubscriptionRepository().disable_by_endpoint(session, endpoint=payload.endpoint)
    if not ok:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"status": "ok"}


