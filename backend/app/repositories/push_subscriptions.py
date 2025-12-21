from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


class PushSubscriptionRepository:
    def get_by_endpoint(self, session: Session, *, endpoint: str) -> PushSubscription | None:
        stmt = select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        return session.execute(stmt).scalar_one_or_none()

    def list_active_for_user(self, session: Session, *, user_id: int) -> list[PushSubscription]:
        stmt = (
            select(PushSubscription)
            .where(PushSubscription.user_id == user_id)
            .where(PushSubscription.disabled_at.is_(None))
            .order_by(PushSubscription.id.desc())
        )
        return list(session.execute(stmt).scalars().all())

    def upsert(
        self,
        session: Session,
        *,
        user_id: int,
        endpoint: str,
        p256dh: str,
        auth: str,
        user_agent: str | None,
    ) -> PushSubscription:
        existing = self.get_by_endpoint(session, endpoint=endpoint)
        now = datetime.utcnow()
        if existing:
            existing.user_id = user_id
            existing.p256dh = p256dh
            existing.auth = auth
            existing.user_agent = user_agent
            existing.disabled_at = None
            existing.last_seen_at = now
            session.flush()
            logger.info("push_subscriptions.upsert updated id=%s", existing.id)
            return existing

        row = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
            last_seen_at=now,
        )
        session.add(row)
        session.flush()
        logger.info("push_subscriptions.upsert created id=%s", row.id)
        return row

    def disable_by_endpoint(self, session: Session, *, endpoint: str) -> bool:
        row = self.get_by_endpoint(session, endpoint=endpoint)
        if not row:
            return False
        row.disabled_at = datetime.utcnow()
        session.flush()
        return True


