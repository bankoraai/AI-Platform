from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class BareOptionsPassthroughMiddleware(BaseHTTPMiddleware):
    """Return a successful response for non-preflight OPTIONS requests.

    Starlette's CORSMiddleware treats OPTIONS without `Access-Control-Request-Method`
    as an invalid CORS preflight and returns 400. That can be surprising during
    manual testing (curl/Postman) and shows up as an OPTIONS failure in devtools.

    This middleware short-circuits ONLY when the request is OPTIONS AND is missing
    preflight headers. Real browser preflights still go through CORSMiddleware.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" and "access-control-request-method" not in request.headers:
            # Minimal successful response; CORS headers are handled by CORSMiddleware
            # for real preflights. For manual OPTIONS, 204 is sufficient.
            return Response(status_code=204)
        return await call_next(request)


