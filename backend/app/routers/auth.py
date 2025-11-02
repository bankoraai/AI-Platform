from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import RedirectResponse
import secrets

from ..config import settings
from ..bank.poalim_client import PoalimPSD2Client
from ..session import create_session

router = APIRouter()

STATE_COOKIE = "oauth_state"
SESSION_COOKIE = "session_id"


@router.get("/auth/login")
async def login(response: Response) -> RedirectResponse:
	client = PoalimPSD2Client()
	state = secrets.token_urlsafe(16)
	auth_url = client.get_authorization_url(state)
	redirect = RedirectResponse(url=auth_url, status_code=302)
	redirect.set_cookie(
		key=STATE_COOKIE,
		value=state,
		httponly=True,
		samesite="lax",
		secure=False,
		path="/",
	)
	return redirect


@router.get("/auth/callback")
async def callback(request: Request, code: str | None = None, state: str | None = None):
	if not code or not state:
		raise HTTPException(status_code=400, detail="Missing code or state")
	state_cookie = request.cookies.get(STATE_COOKIE)
	if not state_cookie or state_cookie != state:
		raise HTTPException(status_code=400, detail="Invalid state")

	client = PoalimPSD2Client()
	token = await client.exchange_code_for_token(code)
	session_id = create_session({"token": token})

	redirect = RedirectResponse(url=f"{settings.frontend_url}/", status_code=302)
	# clear state cookie
	redirect.delete_cookie(STATE_COOKIE, path="/")
	# set session cookie
	redirect.set_cookie(
		key=SESSION_COOKIE,
		value=session_id,
		httponly=True,
		samesite="lax",
		secure=False,
		path="/",
	)
	return redirect
