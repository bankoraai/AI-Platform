from __future__ import annotations
import secrets
from typing import Dict, Optional

_session_store: Dict[str, dict] = {}


def create_session(data: dict) -> str:
	session_id = secrets.token_urlsafe(32)
	_session_store[session_id] = data
	return session_id


def get_session(session_id: str) -> Optional[dict]:
	return _session_store.get(session_id)


def delete_session(session_id: str) -> None:
	_session_store.pop(session_id, None)
