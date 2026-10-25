from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, EmailStr, Field, field_validator

T = TypeVar("T")

CATEGORIES = ["Reflection", "Music", "Community", "Wisdom", "Wellness", "Education", "Interfaith", "Story"]


def media_url(asset) -> str | None:
    return f"/media/{asset.storage_key}" if asset else None


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---------- auth / users ----------
class RegisterIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=2, max_length=80)
    role: Literal["viewer", "creator"] = "viewer"

    @field_validator("email")
    @classmethod
    def lower(cls, v: str) -> str:
        return v.strip().lower()


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str | None = None
    display_name: str
    bio: str
    role: str
    is_active: bool = True
    avatar_url: str | None = None
    follower_count: int = 0
    following_count: int = 0
    video_count: int = 0
    is_following: bool = False
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=80)
    bio: str | None = Field(default=None, max_length=500)
    avatar_asset_id: int | None = None


class UserStatusIn(BaseModel):
    is_active: bool


# ---------- media ----------
class AssetOut(BaseModel):
    id: int
    kind: str
    url: str
    mime_type: str
    size_bytes: int
    original_filename: str


# ---------- videos ----------
class VideoCreate(BaseModel):
    asset_id: int
    title: str = Field(min_length=2, max_length=150)
    description: str = Field(default="", max_length=2000)
    category: str

    @field_validator("category")
    @classmethod
    def cat(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError(f"category must be one of {CATEGORIES}")
        return v


class VideoUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = None

    @field_validator("category")
    @classmethod
    def cat(cls, v):
        if v is not None and v not in CATEGORIES:
            raise ValueError(f"category must be one of {CATEGORIES}")
        return v


class VideoOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    status: str
    rejection_reason: str | None
    video_url: str
    mime_type: str
    owner: UserOut
    like_count: int
    comment_count: int
    liked_by_me: bool
    created_at: datetime
    published_at: datetime | None


# ---------- comments ----------
class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    parent_id: int | None = None


class CommentOut(BaseModel):
    id: int
    video_id: int
    parent_id: int | None
    body: str
    author: UserOut
    created_at: datetime
    replies: list["CommentOut"] = []


class AdminCommentOut(BaseModel):
    id: int
    video_id: int
    video_title: str
    body: str
    author: UserOut
    created_at: datetime


# ---------- podcasts ----------
class PodcastCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str = Field(default="", max_length=2000)
    category: str
    cover_asset_id: int | None = None

    @field_validator("category")
    @classmethod
    def cat(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError(f"category must be one of {CATEGORIES}")
        return v


class PodcastUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = None
    cover_asset_id: int | None = None


class PodcastOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    cover_url: str | None
    owner: UserOut
    episode_count: int
    created_at: datetime


class EpisodeCreate(BaseModel):
    podcast_id: int
    asset_id: int
    title: str = Field(min_length=2, max_length=150)
    description: str = Field(default="", max_length=3000)


class EpisodeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=3000)


class EpisodeOut(BaseModel):
    id: int
    title: str
    description: str
    status: str
    rejection_reason: str | None
    audio_url: str  # media URL (audio or video)
    mime_type: str
    is_video: bool = False
    podcast_id: int
    podcast_title: str
    category: str
    cover_url: str | None
    owner: UserOut
    created_at: datetime
    published_at: datetime | None


# ---------- notifications / reports / moderation ----------
class NotificationOut(BaseModel):
    id: int
    type: str
    message: str
    link: str | None
    is_read: bool
    created_at: datetime


class ReportCreate(BaseModel):
    target_type: Literal["video", "episode", "comment"]
    target_id: int
    reason: str = Field(min_length=3, max_length=300)


class ReportOut(BaseModel):
    id: int
    target_type: str
    target_id: int
    target_title: str
    reason: str
    status: str
    reporter: UserOut
    created_at: datetime


class ReportResolve(BaseModel):
    resolution: Literal["resolved", "dismissed"]


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ReasonIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ModerationItem(BaseModel):
    type: Literal["video", "episode"]
    id: int
    title: str
    status: str
    owner: UserOut
    media_url: str
    mime_type: str
    category: str
    rejection_reason: str | None
    created_at: datetime


class ModerationActionOut(BaseModel):
    id: int
    admin: UserOut
    target_type: str
    target_id: int
    target_title: str
    action: str
    reason: str | None
    created_at: datetime


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    body: str
    created_at: datetime
    read_at: datetime | None


class ConversationOut(BaseModel):
    user: UserOut
    last_message: str
    last_sender_id: int
    last_at: datetime
    unread_count: int


class AuditLogOut(BaseModel):
    id: int
    actor: UserOut | None
    action: str
    entity_type: str
    entity_id: int | None
    details: dict | None
    created_at: datetime
