from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, accounts

app = FastAPI(title="OpenBank AI Backend")

# CORS
app.add_middleware(
	CORSMiddleware,
	allow_origins=[settings.frontend_url],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(accounts.router, prefix="/api", tags=["accounts"])


@app.get("/health")
async def health() -> dict:
	return {"status": "ok"}
