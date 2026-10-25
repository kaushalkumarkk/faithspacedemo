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


def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise err(401, "unauthenticated", "Authentication required.")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise err(403, "forbidden", f"This action requires one of the roles: {', '.join(roles)}.")
        return user

    return dep


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
