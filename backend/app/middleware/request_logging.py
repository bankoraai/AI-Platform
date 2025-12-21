from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..logging_config import set_request_id

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = (request.headers.get("X-Request-Id") or "").strip() or str(uuid.uuid4())
        set_request_id(rid)

        t0 = time.perf_counter()
        logger.info("request.start method=%s path=%s", request.method, request.url.path)
        try:
            response: Response = await call_next(request)
        except Exception:
            logger.exception("request.error method=%s path=%s", request.method, request.url.path)
            raise
        finally:
            dur_ms = (time.perf_counter() - t0) * 1000.0
            # response may not exist on exception; log in normal path below.
            pass

        response.headers["X-Request-Id"] = rid
        dur_ms = (time.perf_counter() - t0) * 1000.0
        logger.info("request.end status=%s dur_ms=%.1f", getattr(response, "status_code", "?"), dur_ms)
        return response


