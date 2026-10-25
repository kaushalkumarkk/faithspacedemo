from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..deps import PageParams, current_user, err
from ..models import Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n: Notification) -> s.NotificationOut:
    return s.NotificationOut(id=n.id, type=n.type, message=n.message, link=n.link, is_read=n.is_read, created_at=n.created_at)


@router.get("", response_model=s.Page[s.NotificationOut])
def list_notifications(unread_only: bool = False, pg: PageParams = Depends(), user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).offset(pg.offset).limit(pg.page_size)).all()
    return s.Page(items=[_out(n) for n in rows], total=total, page=pg.page, page_size=pg.page_size)


@router.get("/unread-count")
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False)))
    return {"count": n or 0}


@router.post("/read-all")
def read_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    res = db.execute(update(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False)).values(is_read=True))
    db.commit()
    return {"updated": res.rowcount}


@router.post("/{notification_id}/read", response_model=s.NotificationOut)
def mark_read(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise err(404, "not_found", "Notification not found.")
    n.is_read = True
    db.commit()
    return _out(n)
