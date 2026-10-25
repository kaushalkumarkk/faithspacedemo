from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session

from .. import schemas as s
from ..config import settings
from ..db import get_db
from ..deps import current_user, err
from ..models import Message, User
from ..security import limiter
from ..services import user_out

router = APIRouter(prefix="/messages", tags=["messages"])


def _out(m: Message) -> s.MessageOut:
    return s.MessageOut(id=m.id, sender_id=m.sender_id, recipient_id=m.recipient_id, body=m.body, created_at=m.created_at, read_at=m.read_at)


@router.get("/unread-count")
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(Message).where(Message.recipient_id == user.id, Message.read_at.is_(None)))
    return {"count": n or 0}


@router.get("/conversations", response_model=list[s.ConversationOut])
def conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """One row per person you have exchanged messages with, newest first."""
    rows = db.scalars(
        select(Message).where(or_(Message.sender_id == user.id, Message.recipient_id == user.id)).order_by(Message.id.desc())
    ).all()
    seen: dict[int, Message] = {}
    unread: dict[int, int] = {}
    for m in rows:
        other = m.recipient_id if m.sender_id == user.id else m.sender_id
        seen.setdefault(other, m)
        if m.recipient_id == user.id and m.read_at is None:
            unread[other] = unread.get(other, 0) + 1
    out = []
    for other_id, m in seen.items():
        other = db.get(User, other_id)
        if other:
            out.append(s.ConversationOut(user=user_out(db, other, user), last_message=m.body[:140], last_sender_id=m.sender_id,
                                         last_at=m.created_at, unread_count=unread.get(other_id, 0)))
    return out


@router.get("/with/{other_id}", response_model=list[s.MessageOut])
def thread(other_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Last 200 messages with another user (oldest first). Opening the thread marks their messages as read."""
    if not db.get(User, other_id):
        raise err(404, "not_found", "User not found.")
    pair = or_(and_(Message.sender_id == user.id, Message.recipient_id == other_id),
               and_(Message.sender_id == other_id, Message.recipient_id == user.id))
    db.execute(update(Message).where(Message.sender_id == other_id, Message.recipient_id == user.id, Message.read_at.is_(None))
               .values(read_at=datetime.now(timezone.utc)))
    db.commit()
    rows = db.scalars(select(Message).where(pair).order_by(Message.id.desc()).limit(200)).all()
    return [_out(m) for m in reversed(rows)]


@router.post("/with/{other_id}", response_model=s.MessageOut, status_code=201)
def send(other_id: int, body: s.MessageCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if other_id == user.id:
        raise err(400, "self_message", "You cannot message yourself.")
    other = db.get(User, other_id)
    if not other or not other.is_active:
        raise err(404, "not_found", "That user is not available.")
    limiter.check(f"msg:{user.id}", settings.message_rate_limit)
    text = body.body.strip()
    if not text:
        raise err(422, "validation_error", "Message cannot be empty.")
    m = Message(sender_id=user.id, recipient_id=other.id, body=text)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)
