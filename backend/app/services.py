"""Shared helpers: serializers, notifications, audit log."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import schemas as s
from .models import (
    AuditLog, Comment, Episode, Follow, Like, MediaAsset, Notification, Podcast, User, Video,
)


def audit(db: Session, actor: User | None, action: str, entity_type: str, entity_id: int | None, details: dict | None = None):
    db.add(AuditLog(actor_id=actor.id if actor else None, action=action, entity_type=entity_type, entity_id=entity_id, details=details))


def notify(db: Session, user_id: int, type_: str, message: str, link: str | None = None):
    db.add(Notification(user_id=user_id, type=type_, message=message[:300], link=link))


def user_out(db: Session, u: User, viewer: User | None = None, full: bool = False) -> s.UserOut:
    out = s.UserOut(
        id=u.id, display_name=u.display_name, bio=u.bio, role=u.role, is_active=u.is_active,
        avatar_url=s.media_url(u.avatar), created_at=u.created_at,
        email=u.email if (viewer and (viewer.id == u.id or viewer.role == "admin")) else None,
    )
    if full:
        out.follower_count = db.scalar(select(func.count()).select_from(Follow).where(Follow.followee_id == u.id)) or 0
        out.following_count = db.scalar(select(func.count()).select_from(Follow).where(Follow.follower_id == u.id)) or 0
        out.video_count = db.scalar(
            select(func.count()).select_from(Video).where(Video.owner_id == u.id, Video.status == "approved")) or 0
        if viewer:
            out.is_following = db.scalar(
                select(func.count()).select_from(Follow).where(Follow.follower_id == viewer.id, Follow.followee_id == u.id)) > 0
    return out


def video_out(db: Session, v: Video, viewer: User | None) -> s.VideoOut:
    likes = db.scalar(select(func.count()).select_from(Like).where(Like.video_id == v.id)) or 0
    comments = db.scalar(select(func.count()).select_from(Comment).where(Comment.video_id == v.id)) or 0
    liked = bool(viewer and db.scalar(select(func.count()).select_from(Like).where(Like.video_id == v.id, Like.user_id == viewer.id)))
    return s.VideoOut(
        id=v.id, title=v.title, description=v.description, category=v.category, status=v.status,
        rejection_reason=v.rejection_reason, video_url=s.media_url(v.asset), mime_type=v.asset.mime_type,
        owner=user_out(db, v.owner, viewer), like_count=likes, comment_count=comments, liked_by_me=liked,
        created_at=v.created_at, published_at=v.published_at,
    )


def podcast_out(db: Session, p: Podcast, public_only: bool = True) -> s.PodcastOut:
    q = select(func.count()).select_from(Episode).where(Episode.podcast_id == p.id)
    if public_only:
        q = q.where(Episode.status == "approved")
    return s.PodcastOut(
        id=p.id, title=p.title, description=p.description, category=p.category, cover_url=s.media_url(p.cover),
        owner=user_out(db, p.owner), episode_count=db.scalar(q) or 0, created_at=p.created_at,
    )


def episode_out(db: Session, e: Episode) -> s.EpisodeOut:
    p = e.podcast
    return s.EpisodeOut(
        id=e.id, title=e.title, description=e.description, status=e.status, rejection_reason=e.rejection_reason,
        audio_url=s.media_url(e.asset), mime_type=e.asset.mime_type, is_video=e.asset.kind == "video", podcast_id=p.id, podcast_title=p.title,
        category=p.category, cover_url=s.media_url(p.cover), owner=user_out(db, p.owner),
        created_at=e.created_at, published_at=e.published_at,
    )


def get_asset_owned(db: Session, asset_id: int | None, user: User, kind: str | tuple[str, ...]) -> MediaAsset | None:
    from .deps import err

    if asset_id is None:
        return None
    a = db.get(MediaAsset, asset_id)
    kinds = (kind,) if isinstance(kind, str) else kind
    if not a or a.kind not in kinds:
        raise err(400, "bad_asset", f"asset_id {asset_id} is not a valid {'/'.join(kinds)} upload.")
    if a.owner_id != user.id and user.role != "admin":
        raise err(403, "forbidden", "You do not own that upload.")
    return a
