import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Runtime configuration loaded from environment.

    Keep this intentionally simple (no extra dependencies) for easier bootstrapping.
    """

    ngc_api_key: str
    ngc_default_model: str
    database_url: str
    cors_origins: list[str]
    vapid_public_key: str
    vapid_private_key: str
    vapid_subject: str


def load_settings() -> Settings:
    # Prefer env vars; .env loading is handled by bootstrap.
    ngc_api_key = os.getenv("NGC_API_KEY", "").strip()
    ngc_default_model = os.getenv("NGC_DEFAULT_MODEL", "minimaxai/minimax-m2").strip()

    # Default DB under backend/data/app.db
    backend_dir = Path(__file__).resolve().parents[1]  # backend/
    default_db_path = backend_dir / "data" / "app.db"
    default_db_url = f"sqlite:///{default_db_path.as_posix()}"
    database_url = os.getenv("DATABASE_URL", default_db_url).strip()

    cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").strip()
    cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

    vapid_public_key = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    vapid_subject = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com").strip()

    return Settings(
        ngc_api_key=ngc_api_key,
        ngc_default_model=ngc_default_model,
        database_url=database_url,
        cors_origins=cors_origins,
        vapid_public_key=vapid_public_key,
        vapid_private_key=vapid_private_key,
        vapid_subject=vapid_subject,
    )


