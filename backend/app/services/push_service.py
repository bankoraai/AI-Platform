from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from pywebpush import WebPushException, webpush

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PushConfig:
    vapid_public_key: str
    vapid_private_key: str
    vapid_subject: str

    def enabled(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key and self.vapid_subject)


class PushService:
    def __init__(self, cfg: PushConfig):
        self.cfg = cfg

    def send(
        self,
        *,
        endpoint: str,
        p256dh: str,
        auth: str,
        title: str,
        body: str,
        data: dict | None = None,
    ) -> None:
        if not self.cfg.enabled():
            raise RuntimeError("Push not configured (missing VAPID keys)")

        subscription_info = {"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}}
        payload = {"title": title, "body": body, "data": data or {}}
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                vapid_private_key=self.cfg.vapid_private_key,
                vapid_claims={"sub": self.cfg.vapid_subject},
            )
        except WebPushException:
            raise
        except Exception as e:
            logger.warning("push.send failed err=%s", e)
            raise


