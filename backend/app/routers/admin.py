from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..deps import PageParams, admin_user, current_user, err
from ..models import (
    AuditLog, Comment, Episode, Like, Message, ModerationAction, Podcast, Report, User, Video,
)
from ..services import audit, delete_asset_if_unused, notify, user_out
from ..storage import delete_key

moderation_router = APIRouter(prefix="/admin/moderation", tags=["admin"])
reports_router = APIRouter(tags=["reports"])
audit_router = APIRouter(prefix="/admin/audit-logs", tags=["admin"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

Kind = Literal["video", "episode"]


def _get_target(db: Session, kind: str, id_: int):
    obj = db.get(Video if kind == "video" else Episode, id_)
    if not obj:
        raise err(404, "not_found", f"{kind.title()} not found.")
    return obj


def _owner(obj) -> User:
    return obj.owner if isinstance(obj, Video) else obj.podcast.owner


def _item(db: Session, kind: str, obj, admin: User) -> s.ModerationItem:
    return s.ModerationItem(
        type=kind, id=obj.id, title=obj.title, status=obj.status, owner=user_out(db, _owner(obj), admin),
        media_url=s.media_url(obj.asset),
        thumbnail_url=s.media_url(obj.thumbnail) if kind == "video" else s.media_url(obj.podcast.cover),
        duration_seconds=obj.duration_seconds if kind == "video" else None,
        mime_type=obj.asset.mime_type,
        category=obj.category if kind == "video" else obj.podcast.category,
        rejection_reason=obj.rejection_reason, created_at=obj.created_at,
    )


@moderation_router.get("/queue", response_model=s.Page[s.ModerationItem])
def queue(status: str = "pending", type: Literal["video", "episode", "all"] = "all", pg: PageParams = Depends(),
          admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """status=pending is the moderation queue; status=all lists everything (Videos / Podcasts admin pages)."""
    items: list[tuple[datetime, str, object]] = []
    for kind, model in (("video", Video), ("episode", Episode)):
        if type not in ("all", kind):
            continue
        stmt = select(model)
        if status != "all":
            stmt = stmt.where(model.status == status)
        for o in db.scalars(stmt).unique().all():
            items.append((o.created_at, kind, o))
    items.sort(key=lambda t: t[0], reverse=True)
    page = items[pg.offset: pg.offset + pg.page_size]
    return s.Page(items=[_item(db, k, o, admin) for _, k, o in page], total=len(items), page=pg.page, page_size=pg.page_size)


def _moderate(db: Session, admin: User, kind: str, id_: int, action: str, reason: str | None):
    obj = _get_target(db, kind, id_)
    allowed = {"approve": ("pending", "rejected", "hidden"), "reject": ("pending",), "hide": ("approved",), "restore": ("hidden", "rejected")}
    if obj.status not in allowed[action]:
        raise err(409, "invalid_transition", f"Cannot {action} content that is {obj.status}.")
    owner = _owner(obj)
    link = f"/?v={obj.id}" if kind == "video" else f"/episodes/{obj.id}"
    if action in ("approve", "restore"):
        obj.status, obj.rejection_reason = "approved", None
        obj.published_at = obj.published_at or datetime.now(timezone.utc)
        notify(db, owner.id, "approved", f"Your {kind} “{obj.title}” was approved and is now live.", link)
    elif action == "reject":
        obj.status, obj.rejection_reason, obj.published_at = "rejected", reason, None
        notify(db, owner.id, "rejected", f"Your {kind} “{obj.title}” was rejected: {reason}", "/studio")
    else:  # hide
        obj.status = "hidden"
        notify(db, owner.id, "hidden", f"Your {kind} “{obj.title}” was unpublished by a moderator.", "/studio")
    db.add(ModerationAction(admin_id=admin.id, target_type=kind, target_id=obj.id, target_title=obj.title[:200],
                            action=action, reason=reason))
    audit(db, admin, f"moderation.{action}", kind, obj.id, {"title": obj.title, "reason": reason})
    db.commit()  # status change + moderation record + audit + notification: one transaction
    return _item(db, kind, obj, admin)


@moderation_router.post("/{kind}/{item_id}/approve", response_model=s.ModerationItem)
def approve(kind: Kind, item_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _moderate(db, admin, kind, item_id, "approve", None)


@moderation_router.post("/{kind}/{item_id}/reject", response_model=s.ModerationItem)
def reject(kind: Kind, item_id: int, body: s.RejectIn, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _moderate(db, admin, kind, item_id, "reject", body.reason)


@moderation_router.post("/{kind}/{item_id}/hide", response_model=s.ModerationItem)
def hide(kind: Kind, item_id: int, body: s.ReasonIn | None = None, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _moderate(db, admin, kind, item_id, "hide", body.reason if body else None)


@moderation_router.post("/{kind}/{item_id}/restore", response_model=s.ModerationItem)
def restore(kind: Kind, item_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _moderate(db, admin, kind, item_id, "restore", None)


def _remove_content(db: Session, admin: User, kind: Kind, item_id: int, reason: str | None):
    obj = _get_target(db, kind, item_id)
    owner = _owner(obj)
    title = obj.title
    asset = obj.asset
    thumb = obj.thumbnail if kind == "video" else None
    clean_reason = reason.strip() if reason and reason.strip() else None

    db.execute(
        update(Report)
        .where(Report.target_type == kind, Report.target_id == item_id, Report.status == "open")
        .values(status="resolved", resolved_by_id=admin.id)
    )
    db.add(ModerationAction(admin_id=admin.id, target_type=kind, target_id=item_id, target_title=title[:200],
                            action="delete", reason=clean_reason or "Removed by admin"))
    audit(db, admin, "moderation.delete", kind, item_id, {"title": title, "reason": clean_reason})
    msg = f"Your {kind} “{title}” was permanently removed by an admin."
    if clean_reason:
        msg += f" Reason: {clean_reason}"
    notify(db, owner.id, "hidden", msg, "/studio")
    db.delete(obj)
    db.flush()
    keys = [k for k in (delete_asset_if_unused(db, asset), delete_asset_if_unused(db, thumb)) if k]
    db.commit()
    for k in keys:
        delete_key(k)
    return {"status": "deleted", "type": kind, "id": item_id}


@moderation_router.post("/{kind}/{item_id}/remove")
def remove_post(kind: Kind, item_id: int, body: s.ReasonIn | None = None,
                admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _remove_content(db, admin, kind, item_id, body.reason if body else None)


@moderation_router.delete("/{kind}/{item_id}")
def remove_delete(kind: Kind, item_id: int, reason: str | None = None,
                  admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _remove_content(db, admin, kind, item_id, reason)


@moderation_router.get("/history", response_model=s.Page[s.ModerationActionOut])
def history(pg: PageParams = Depends(), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    total = db.scalar(select(func.count()).select_from(ModerationAction))
    rows = db.scalars(select(ModerationAction).order_by(ModerationAction.id.desc()).offset(pg.offset).limit(pg.page_size)).unique().all()
    return s.Page(items=[s.ModerationActionOut(id=a.id, admin=user_out(db, a.admin), target_type=a.target_type, target_id=a.target_id,
                                               target_title=a.target_title, action=a.action, reason=a.reason, created_at=a.created_at)
                         for a in rows], total=total, page=pg.page, page_size=pg.page_size)


# ---------- reports ----------
def _target_info(db: Session, r: Report) -> tuple[str, int | None]:
    if r.target_type == "comment":
        c = db.get(Comment, r.target_id)
        return (c.body[:80], c.author_id) if c else ("(deleted comment)", None)
    if r.target_type == "user":
        u = db.get(User, r.target_id)
        return (u.display_name, u.id) if u else ("(deleted user)", None)
    if r.target_type == "message":
        m = db.get(Message, r.target_id)
        return (m.body[:80], m.sender_id) if m else ("(deleted message)", None)
    if r.target_type == "video":
        v = db.get(Video, r.target_id)
        return (v.title, v.owner_id) if v else ("(deleted video)", None)
    e = db.get(Episode, r.target_id)
    return (e.title, e.podcast.owner_id) if e else ("(deleted episode)", None)


@reports_router.post("/reports", status_code=201)
def create_report(body: s.ReportCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    model = {"video": Video, "episode": Episode, "comment": Comment, "user": User, "message": Message}[body.target_type]
    target = db.get(model, body.target_id)
    if not target:
        raise err(404, "not_found", "Reported content not found.")
    if body.target_type == "user" and target.id == user.id:
        raise err(400, "self_report", "You cannot report yourself.")
    if body.target_type == "message" and user.id not in (target.sender_id, target.recipient_id):
        raise err(403, "forbidden", "You can only report messages in your own conversations.")
    dup = db.scalar(select(Report).where(Report.reporter_id == user.id, Report.target_type == body.target_type,
                                         Report.target_id == body.target_id, Report.status == "open"))
    if dup:
        raise err(409, "duplicate_report", "You already have an open report for this content.")
    r = Report(reporter_id=user.id, target_type=body.target_type, target_id=body.target_id, reason=body.reason.strip())
    db.add(r)
    audit(db, user, "report.create", body.target_type, body.target_id)
    db.commit()
    return {"id": r.id, "status": r.status}


@reports_router.get("/admin/reports", response_model=s.Page[s.ReportOut])
def list_reports(status: str = "open", pg: PageParams = Depends(), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    stmt = select(Report)
    if status != "all":
        stmt = stmt.where(Report.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Report.id.desc()).offset(pg.offset).limit(pg.page_size)).unique().all()
    items = []
    for r in rows:
        title, uid = _target_info(db, r)
        items.append(s.ReportOut(id=r.id, target_type=r.target_type, target_id=r.target_id, target_title=title,
                                 target_user_id=uid, reason=r.reason, status=r.status,
                                 reporter=user_out(db, r.reporter), created_at=r.created_at))
    return s.Page(items=items, total=total, page=pg.page, page_size=pg.page_size)


@reports_router.post("/admin/reports/{report_id}/resolve")
def resolve_report(report_id: int, body: s.ReportResolve, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    r = db.get(Report, report_id)
    if not r:
        raise err(404, "not_found", "Report not found.")
    r.status, r.resolved_by_id = body.resolution, admin.id
    audit(db, admin, f"report.{body.resolution}", r.target_type, r.target_id, {"report_id": r.id})
    db.commit()
    return {"id": r.id, "status": r.status}


# ---------- audit log, comments, overview ----------
@audit_router.get("", response_model=s.Page[s.AuditLogOut])
def audit_logs(action: str | None = None, pg: PageParams = Depends(), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).offset(pg.offset).limit(pg.page_size)).unique().all()
    return s.Page(items=[s.AuditLogOut(id=a.id, actor=user_out(db, a.actor) if a.actor else None, action=a.action, entity_type=a.entity_type,
                                       entity_id=a.entity_id, details=a.details, created_at=a.created_at) for a in rows],
                  total=total, page=pg.page, page_size=pg.page_size)


@admin_router.get("/comments", response_model=s.Page[s.AdminCommentOut])
def admin_comments(q: str | None = None, pg: PageParams = Depends(), admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    stmt = select(Comment)
    if q:
        stmt = stmt.where(Comment.body.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Comment.id.desc()).offset(pg.offset).limit(pg.page_size)).unique().all()
    out = []
    for c in rows:
        v = db.get(Video, c.video_id)
        out.append(s.AdminCommentOut(id=c.id, video_id=c.video_id, video_title=v.title if v else "", body=c.body,
                                     author=user_out(db, c.author, admin), created_at=c.created_at))
    return s.Page(items=out, total=total, page=pg.page, page_size=pg.page_size)


@admin_router.get("/overview")
def overview(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    def count(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    return {
        "users": count(User), "creators": count(User, User.role == "creator"),
        "videos": {st: count(Video, Video.status == st) for st in ("pending", "approved", "rejected", "hidden")},
        "episodes": {st: count(Episode, Episode.status == st) for st in ("pending", "approved", "rejected", "hidden")},
        "podcasts": count(Podcast), "comments": count(Comment), "likes": count(Like),
        "open_reports": count(Report, Report.status == "open"), "moderation_actions": count(ModerationAction),
    }
