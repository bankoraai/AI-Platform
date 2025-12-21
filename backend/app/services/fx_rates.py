from __future__ import annotations

import time
from dataclasses import dataclass

import requests
import logging

from ..logging_config import Timer

logger = logging.getLogger(__name__)


def normalize_currency(code: str) -> str:
    c = (code or "").strip().upper()
    # UI uses NIS, FX APIs typically use ILS
    if c == "NIS":
        return "ILS"
    return c


@dataclass
class FxRates:
    ttl_seconds: int = 3600
    base_url: str = "https://api.frankfurter.app"

    _cache: dict[tuple[str, str], tuple[float, float]] = None  # (from,to)->(ts,rate)

    def __post_init__(self):
        if self._cache is None:
            self._cache = {}

    def get_rate(self, *, from_currency: str, to_currency: str) -> float:
        f = normalize_currency(from_currency)
        t = normalize_currency(to_currency)
        if not f or not t:
            raise ValueError("from_currency and to_currency are required")
        if f == t:
            return 1.0

        key = (f, t)
        now = time.time()
        cached = self._cache.get(key)
        if cached:
            ts, rate = cached
            if now - ts < self.ttl_seconds:
                logger.debug("fx.rate cache_hit %s->%s rate=%s", f, t, rate)
                return rate

        # Frankfurter uses ECB rates; simple, free, no key.
        # Example: /latest?from=USD&to=ILS
        url = f"{self.base_url}/latest"
        timer = Timer()
        res = requests.get(url, params={"from": f, "to": t}, timeout=10)
        res.raise_for_status()
        data = res.json()
        try:
            rate = float(data["rates"][t])
        except Exception as e:
            raise ValueError(f"Invalid FX response for {f}->{t}") from e

        self._cache[key] = (now, rate)
        logger.info("fx.rate fetched %s->%s rate=%s dur_ms=%.1f", f, t, rate, timer.ms())
        return rate


# Singleton for app usage (in-memory cache per process)
fx_rates = FxRates()


