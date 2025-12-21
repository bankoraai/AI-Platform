import logging

from fastapi import APIRouter


router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health")
def health():
    logger.debug("health.ok")
    return {"status": "ok"}


