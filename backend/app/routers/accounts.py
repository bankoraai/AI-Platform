from fastapi import APIRouter, Request, HTTPException

from ..config import settings
from ..session import get_session
from ..bank.poalim_client import PoalimPSD2Client

router = APIRouter()


@router.get("/accounts")
async def list_accounts(request: Request):
	# Demo mode returns stub data for easy testing without real credentials
	if settings.demo_mode:
		return {
			"accounts": [
				{"id": "ACC-001", "name": "Checking", "iban": "IL12 1234 5678 9012", "balance": 12453.75, "currency": "ILS"},
				{"id": "ACC-002", "name": "Savings", "iban": "IL98 7654 3210 9876", "balance": 50234.10, "currency": "ILS"},
			]
		}

	session_id = request.cookies.get("session_id")
	if not session_id:
		raise HTTPException(status_code=401, detail="Not authenticated")

	session = get_session(session_id)
	if not session:
		raise HTTPException(status_code=401, detail="Session expired")

	token = session.get("token") or {}
	access_token = token.get("access_token")
	if not access_token:
		raise HTTPException(status_code=401, detail="Missing access token")

	client = PoalimPSD2Client()
	data = await client.get_accounts(access_token)
	# Try to normalize common shapes
	accounts = data.get("accounts") if isinstance(data, dict) else data
	return {"accounts": accounts}
