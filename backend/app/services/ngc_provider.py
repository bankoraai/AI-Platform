from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.ngc_llm import NGCClient
import logging

from ..logging_config import redact, should_log_payloads, Timer

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NGCProvider:
    api_key: str
    default_model: str

    def _client(self) -> NGCClient:
        if not self.api_key:
            raise ValueError("Missing NGC_API_KEY; set it in .env to enable plan generation.")
        return NGCClient(api_key=self.api_key)

    def chat(self, *, system: str, user: str, max_tokens: int = 2000, temperature: float = 0.4) -> dict[str, Any]:
        client = self._client()
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        t = Timer()
        logger.info("ngc.chat start model=%s max_tokens=%s temp=%s msgs=%s", "deepseek-ai/deepseek-v3.1", max_tokens, temperature, len(messages))
        if should_log_payloads():
            logger.debug("ngc.chat system=%s", system)
            logger.debug("ngc.chat user=%s", user)
        else:
            logger.debug("ngc.chat system=%s", redact(system, keep=0))
            logger.debug("ngc.chat user=%s", redact(user, keep=0))

        resp = client.chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            retries=2,
            timeout_seconds=600,
            model_name="deepseek-ai/deepseek-v3.1",
        )
        logger.info("ngc.chat done dur_ms=%.1f", t.ms())
        return resp


