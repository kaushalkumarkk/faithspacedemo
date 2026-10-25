from datetime import datetime, timezone

from sqlalchemy import (
    JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Content lifecycle: pending -> approved | rejected ; approved <-> hidden
STATUSES = ("pending", "approved", "rejected", "hidden")
ROLES = ("viewer", "creator", "admin")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80))
    bio: Mapped[str] = mapped_column(Text, default="")
    role: Mapped[str] = mapped_column(String(16), default="viewer", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    avatar_asset_id: Mapped[int | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL", use_alter=True, name="fk_user_avatar"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    avatar = relationship("MediaAsset", foreign_keys=[avatar_asset_id], lazy="joined")


class MediaAsset(Base):
    __tablename__ = "media_assets"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # video | audio | image
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Video(Base):
    __tablename__ = "videos"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("media_assets.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", lazy="joined")
    asset = relationship("MediaAsset", lazy="joined")
    __table_args__ = (Index("ix_videos_status_published", "status", "published_at"),)


class Podcast(Base):
    __tablename__ = "podcasts"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), index=True)
    cover_asset_id: Mapped[int | None] = mapped_column(ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner = relationship("User", lazy="joined")
    cover = relationship("MediaAsset", lazy="joined")
    episodes = relationship("Episode", back_populates="podcast", cascade="all, delete-orphan")


class Episode(Base):
    __tablename__ = "episodes"
    id: Mapped[int] = mapped_column(primary_key=True)
    podcast_id: Mapped[int] = mapped_column(ForeignKey("podcasts.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("media_assets.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    podcast = relationship("Podcast", back_populates="episodes", lazy="joined")
    asset = relationship("MediaAsset", lazy="joined")


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    author = relationship("User", lazy="joined")


class Like(Base):
    __tablename__ = "likes"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    video_id: Mapped[int] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("user_id", "video_id", name="uq_like_user_video"),)


class Follow(Base):
    __tablename__ = "follows"
    id: Mapped[int] = mapped_column(primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    followee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("follower_id", "followee_id", name="uq_follow_pair"),)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(30))  # comment|reply|approved|rejected|hidden|follow
    message: Mapped[str] = mapped_column(String(300))
    link: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (Index("ix_notif_user_read", "user_id", "is_read", "created_at"),)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    target_type: Mapped[str] = mapped_column(String(10))  # video | episode | comment
    target_id: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(10), default="open", index=True)  # open|resolved|dismissed
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reporter = relationship("User", foreign_keys=[reporter_id], lazy="joined")
    __table_args__ = (Index("ix_reports_target", "target_type", "target_id"),)


class ModerationAction(Base):
    __tablename__ = "moderation_actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    target_type: Mapped[str] = mapped_column(String(10))
    target_id: Mapped[int] = mapped_column(Integer)
    target_title: Mapped[str] = mapped_column(String(200), default="")
    action: Mapped[str] = mapped_column(String(10))  # approve|reject|hide|restore|delete
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    admin = relationship("User", lazy="joined")


class Message(Base):
    """Direct (1:1) message. read_at is set when the recipient opens the thread."""
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (
        Index("ix_messages_pair", "sender_id", "recipient_id", "created_at"),
        Index("ix_messages_unread", "recipient_id", "read_at"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(40), index=True)
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    actor = relationship("User", lazy="joined")
