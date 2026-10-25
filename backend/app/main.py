from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .routers import admin, auth_users, messages, notifications, podcasts, uploads, videos

app = FastAPI(title="Faith Space API — Technical Proof of Concept", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)


def _error(status: int, code: str, message: str, details=None):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details}})


@app.exception_handler(HTTPException)
async def http_exc(_: Request, exc: HTTPException):
    d = exc.detail
    if isinstance(d, dict) and "code" in d:
        return _error(exc.status_code, d["code"], d["message"], d.get("details"))
    return _error(exc.status_code, "http_error", str(d))


@app.exception_handler(RequestValidationError)
async def validation_exc(_: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    msg = details[0]["message"] if details else "Invalid request."
    if details and details[0]["field"]:
        msg = f"{details[0]['field']}: {msg}"
    return _error(422, "validation_error", msg, details)


for r in (
    auth_users.auth_router, auth_users.users_router, uploads.uploads_router, uploads.media_router,
    videos.videos_router, videos.comments_router, podcasts.podcasts_router, podcasts.episodes_router,
    notifications.router, messages.router, admin.moderation_router, admin.reports_router, admin.audit_router, admin.admin_router,
):
    app.include_router(r)


@app.get("/health")
def health():
    return {"status": "ok", "service": "faithspace-api"}


@app.get("/categories")
def categories():
    from .schemas import CATEGORIES

    return CATEGORIES
