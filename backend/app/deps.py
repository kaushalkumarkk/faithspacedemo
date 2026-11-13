from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def err(status: int, code: str, message: str, details=None) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message, "details": details})


def _user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    uid = decode_token(token)
    if uid is None:
        return None
    user = db.get(User, uid)
    return user if user and user.is_active else None


def optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User | None:
    return _user_from_token(db, creds.credentials if creds else None)


def current_user(user: User | None = Depends(optional_user), db: Session = Depends(get_db)) -> User:
    if user is None:
        raise err(401, "unauthenticated", "Authentication required.")
    # Presence: any authenticated request counts as activity (written at most every 30s per user).
    now = datetime.now(timezone.utc)
    seen = user.last_seen_at
    if seen is not None and seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    if seen is None or now - seen > timedelta(seconds=30):
        user.last_seen_at = now
        db.commit()
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise err(403, "forbidden", f"This action requires one of the roles: {', '.join(roles)}.")
        return user

    return dep


def member_user(user: User = Depends(current_user)) -> User:
    """A real (non-guest) account. Guests may browse, like, comment and save, but not message or follow."""
    if user.is_guest:
        raise err(403, "guest_restricted", "Create a free account to use this feature.")
    return user


creator_user = require_roles("creator", "admin")
admin_user = require_roles("admin")


class PageParams:
    def __init__(self, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
        self.page, self.page_size = page, page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
