from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..deps import PageParams, creator_user, current_user, err, optional_user
from ..models import Comment, Like, Notification, User, Video
from ..services import audit, get_asset_owned, notify, user_out, video_out

videos_router = APIRouter(prefix="/videos", tags=["videos"])
comments_router = APIRouter(tags=["comments"])


def _visible(v: Video | None, viewer: User | None) -> Video:
    if not v:
        raise err(404, "not_found", "Video not found.")
    if v.status != "approved" and not (viewer and (viewer.id == v.owner_id or viewer.role == "admin")):
        raise err(404, "not_found", "Video not found.")
    return v


@videos_router.get("", response_model=s.Page[s.VideoOut])
def feed(q: str | None = None, category: str | None = None, owner_id: int | None = None, pg: PageParams = Depends(),
         viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    """Public feed: approved videos only."""
    stmt = select(Video).where(Video.status == "approved")
    if q:
        stmt = stmt.where(Video.title.ilike(f"%{q}%") | Video.description.ilike(f"%{q}%"))
    if category:
        stmt = stmt.where(Video.category == category)
    if owner_id:
        stmt = stmt.where(Video.owner_id == owner_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Video.published_at.desc(), Video.id.desc()).offset(pg.offset).limit(pg.page_size)).unique().all()
    return s.Page(items=[video_out(db, v, viewer) for v in rows], total=total, page=pg.page, page_size=pg.page_size)


@videos_router.get("/mine", response_model=list[s.VideoOut])
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Video).where(Video.owner_id == user.id).order_by(Video.id.desc())).unique().all()
    return [video_out(db, v, user) for v in rows]


@videos_router.post("", response_model=s.VideoOut, status_code=201)
def create_video(body: s.VideoCreate, user: User = Depends(creator_user), db: Session = Depends(get_db)):
    asset = get_asset_owned(db, body.asset_id, user, "video")
    if db.scalar(select(Video).where(Video.asset_id == asset.id)):
        raise err(409, "asset_used", "That upload is already attached to a video.")
    v = Video(owner_id=user.id, asset_id=asset.id, title=body.title.strip(), description=body.description.strip(),
              category=body.category, status="pending")
    db.add(v)
    db.flush()
    audit(db, user, "video.submit", "video", v.id, {"title": v.title})
    db.commit()
    db.refresh(v)
    return video_out(db, v, user)


@videos_router.get("/{video_id}", response_model=s.VideoOut)
def get_video(video_id: int, viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    return video_out(db, _visible(db.get(Video, video_id), viewer), viewer)


@videos_router.patch("/{video_id}", response_model=s.VideoOut)
def update_video(video_id: int, body: s.VideoUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = db.get(Video, video_id)
    if not v or v.owner_id != user.id:
        raise err(404 if not v else 403, "not_found" if not v else "forbidden", "Video not found or not yours.")
    for k, val in body.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(v, k, val.strip() if isinstance(val, str) else val)
    # An edited approved video goes back through moderation.
    if v.status == "approved":
        v.status, v.published_at = "pending", None
    audit(db, user, "video.edit", "video", v.id)
    db.commit()
    return video_out(db, v, user)


@videos_router.delete("/{video_id}", status_code=204)
def delete_video(video_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from ..models import MediaAsset
    from ..storage import delete_key

    v = db.get(Video, video_id)
    if not v:
        raise err(404, "not_found", "Video not found.")
    if v.owner_id != user.id and user.role != "admin":
        raise err(403, "forbidden", "You can only delete your own videos.")
    asset = v.asset
    audit(db, user, "video.delete", "video", v.id, {"title": v.title})
    db.delete(v)
    db.flush()
    db.delete(asset)
    db.commit()
    delete_key(asset.storage_key)


# ---------- likes ----------
def _like_state(db: Session, v: Video, viewer: User) -> dict:
    n = db.scalar(select(func.count()).select_from(Like).where(Like.video_id == v.id)) or 0
    return {"liked": bool(db.scalar(select(Like).where(Like.video_id == v.id, Like.user_id == viewer.id))), "like_count": n}


@videos_router.post("/{video_id}/likes")
def like(video_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _visible(db.get(Video, video_id), user)
    if not db.scalar(select(Like).where(Like.video_id == v.id, Like.user_id == user.id)):
        db.add(Like(video_id=v.id, user_id=user.id))
        db.commit()
    return _like_state(db, v, user)


@videos_router.delete("/{video_id}/likes")
def unlike(video_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _visible(db.get(Video, video_id), user)
    row = db.scalar(select(Like).where(Like.video_id == v.id, Like.user_id == user.id))
    if row:
        db.delete(row)
        db.commit()
    return _like_state(db, v, user)


# ---------- comments ----------
def _comment_out(db, c: Comment, viewer, replies=None) -> s.CommentOut:
    return s.CommentOut(id=c.id, video_id=c.video_id, parent_id=c.parent_id, body=c.body,
                        author=user_out(db, c.author, viewer), created_at=c.created_at, replies=replies or [])


@videos_router.get("/{video_id}/comments", response_model=list[s.CommentOut])
def list_comments(video_id: int, viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    v = _visible(db.get(Video, video_id), viewer)
    rows = db.scalars(select(Comment).where(Comment.video_id == v.id).order_by(Comment.created_at, Comment.id)).unique().all()
    by_parent: dict[int | None, list[Comment]] = {}
    for c in rows:
        by_parent.setdefault(c.parent_id, []).append(c)
    top = by_parent.get(None, [])[::-1]  # newest top-level first; replies chronological
    return [_comment_out(db, c, viewer, [_comment_out(db, r, viewer) for r in by_parent.get(c.id, [])]) for c in top]


@videos_router.post("/{video_id}/comments", response_model=s.CommentOut, status_code=201)
def add_comment(video_id: int, body: s.CommentCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = _visible(db.get(Video, video_id), user)
    parent = None
    if body.parent_id:
        parent = db.get(Comment, body.parent_id)
        if not parent or parent.video_id != v.id:
            raise err(400, "bad_parent", "Parent comment does not belong to this video.")
        if parent.parent_id is not None:  # keep threads one level deep
            parent = db.get(Comment, parent.parent_id)
    c = Comment(video_id=v.id, author_id=user.id, parent_id=parent.id if parent else None, body=body.body.strip())
    db.add(c)
    db.flush()
    link = f"/?v={v.id}"
    if parent and parent.author_id != user.id:
        notify(db, parent.author_id, "reply", f"{user.display_name} replied to your comment on “{v.title}”.", link)
    if v.owner_id != user.id and not (parent and parent.author_id == v.owner_id):
        notify(db, v.owner_id, "comment", f"{user.display_name} commented on “{v.title}”.", link)
    db.commit()
    db.refresh(c)
    return _comment_out(db, c, user)


@comments_router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(Comment, comment_id)
    if not c:
        raise err(404, "not_found", "Comment not found.")
    if c.author_id != user.id and user.role != "admin":
        raise err(403, "forbidden", "You can only delete your own comments.")
    if user.role == "admin" and c.author_id != user.id:
        from ..models import ModerationAction

        db.add(ModerationAction(admin_id=user.id, target_type="comment", target_id=c.id, target_title=c.body[:80],
                                action="delete", reason="Deleted by admin"))
    audit(db, user, "comment.delete", "comment", c.id)
    db.delete(c)
    db.commit()
