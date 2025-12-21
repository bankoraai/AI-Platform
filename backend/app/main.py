from fastapi import APIRouter

from .bootstrap import bootstrap_app
from .middleware.request_logging import RequestLoggingMiddleware
from .api.routes.health import router as health_router
from .api.routes.profiles import router as profiles_router
from .api.routes.plans import router as plans_router
from .api.routes.settings import router as settings_router
from .api.routes.tasks import router as tasks_router
from .api.routes.checkins import router as checkins_router
from .api.routes.push import router as push_router


app = bootstrap_app()
app.add_middleware(RequestLoggingMiddleware)

api = APIRouter(prefix="/api")
api.include_router(health_router)
api.include_router(profiles_router)
api.include_router(plans_router)
api.include_router(settings_router)
api.include_router(tasks_router)
api.include_router(checkins_router)
api.include_router(push_router)
app.include_router(api)


