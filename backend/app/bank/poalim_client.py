import httpx
from urllib.parse import urlencode

from ..config import settings


class PoalimPSD2Client:
	def __init__(self) -> None:
		self.client_id = settings.poalim_client_id
		self.client_secret = settings.poalim_client_secret
		self.authorization_url = settings.poalim_authorization_url
		self.token_url = settings.poalim_token_url
		self.redirect_uri = settings.poalim_redirect_uri
		self.api_base_url = settings.poalim_api_base_url
		self.accounts_endpoint = settings.poalim_accounts_endpoint
		self.scopes = "aisp"

	def get_authorization_url(self, state: str) -> str:
		if not self.authorization_url:
			raise RuntimeError("POALIM_AUTHORIZATION_URL is not set")
		query = {
			"response_type": "code",
			"client_id": self.client_id,
			"redirect_uri": self.redirect_uri,
			"scope": self.scopes,
			"state": state,
		}
		return f"{self.authorization_url}?{urlencode(query)}"

	async def exchange_code_for_token(self, code: str) -> dict:
		if not self.token_url:
			raise RuntimeError("POALIM_TOKEN_URL is not set")
		data = {
			"grant_type": "authorization_code",
			"code": code,
			"redirect_uri": self.redirect_uri,
			"client_id": self.client_id,
			"client_secret": self.client_secret,
		}
		async with httpx.AsyncClient(timeout=30.0) as client:
			resp = await client.post(self.token_url, data=data)
			resp.raise_for_status()
			return resp.json()

	async def get_accounts(self, access_token: str) -> dict:
		url = self.accounts_endpoint or (
			f"{self.api_base_url.rstrip('/')}/accounts" if self.api_base_url else None
		)
		if not url:
			raise RuntimeError("No accounts endpoint configured")
		headers = {
			"Authorization": f"Bearer {access_token}",
			"Accept": "application/json",
		}
		async with httpx.AsyncClient(timeout=30.0) as client:
			resp = await client.get(url, headers=headers)
			resp.raise_for_status()
			return resp.json()
