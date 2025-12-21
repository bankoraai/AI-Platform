from __future__ import annotations

import logging
import os
import sys
import time
from contextvars import ContextVar

_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def set_request_id(request_id: str) -> None:
    _request_id_ctx.set(request_id or "-")


def get_request_id() -> str:
    return _request_id_ctx.get()


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


def should_log_payloads() -> bool:
    return os.getenv("LOG_DEBUG_PAYLOADS", "false").strip().lower() in {"1", "true", "yes", "y", "on"}


def redact(text: str, *, keep: int = 0) -> str:
    if not text:
        return ""
    if keep <= 0:
        return "[REDACTED]"
    return text[:keep] + f"...[REDACTED {max(0, len(text) - keep)} chars]"


def configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    # Clear any existing handlers (avoid duplicate logs in reload/dev).
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    fmt = "%(asctime)s | %(levelname)s | %(name)s | rid=%(request_id)s | %(message)s"
    handler.setFormatter(logging.Formatter(fmt=fmt, datefmt="%Y-%m-%d %H:%M:%S"))
    handler.addFilter(RequestIdFilter())
    root.addHandler(handler)

    # Reduce noisy loggers unless explicitly overridden by LOG_LEVEL.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


class Timer:
    def __init__(self):
        self._t0 = time.perf_counter()

    def ms(self) -> float:
        return (time.perf_counter() - self._t0) * 1000.0


