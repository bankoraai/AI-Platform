from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
	app_name: str = "OpenBank AI Backend"
	backend_url: str = Field(default="http://localhost:8000")
	frontend_url: str = Field(default="http://localhost:3000")
	demo_mode: bool = Field(default=True)
	secret_key: str = Field(default="change-me")
	ngc_api_key: str | None = None

	poalim_client_id: str | None = None
	poalim_client_secret: str | None = None
	poalim_redirect_uri: str = Field(default="http://localhost:8000/api/auth/callback")
	poalim_authorization_url: str | None = None
	poalim_token_url: str | None = None
	poalim_api_base_url: str | None = None
	poalim_accounts_endpoint: str | None = None

	client_cert_path: str | None = None
	client_key_path: str | None = None
	ca_bundle_path: str | None = None

	class Config:
		env_file = ".env"
		extra = "ignore"


settings = Settings()
