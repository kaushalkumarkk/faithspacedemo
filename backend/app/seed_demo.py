"""Seed demo content from backend/seed_media (real, playable files). Idempotent.

Run:  python -m app.seed_demo
Creates: approved videos + episodes, one PENDING video and one PENDING episode (so the admin
queue is not empty), comments/replies, likes, follows, a report, notifications and audit records.
"""
import hashlib
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from .config import BASE_DIR
from .db import SessionLocal
from .models import (
    AuditLog, Comment, Episode, Follow, Like, MediaAsset, ModerationAction, Notification, Podcast, Report, User, Video,
)
from .seed import seed
from .storage import path_for

MEDIA = BASE_DIR / "seed_media"
MIME = {".webm": ("video", "video/webm"), ".mp3": ("audio", "audio/mpeg")}


def _asset(db, owner: User, filename: str) -> MediaAsset:
    src = MEDIA / filename
    if not src.exists():
        raise SystemExit(f"Missing {src}. Generate demo media first (see README).")
    kind, mime = MIME[src.suffix]
    key = f"{kind}/{uuid.uuid4().hex}{src.suffix}"
    dest = path_for(key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)
    a = MediaAsset(owner_id=owner.id, kind=kind, storage_key=key, original_filename=filename, mime_type=mime,
                   size_bytes=src.stat().st_size, sha256=hashlib.sha256(src.read_bytes()).hexdigest())
    db.add(a)
    db.flush()
    return a


def seed_demo():
    seed()
    with SessionLocal() as db:
        if db.scalar(select(Video).where(Video.title == "Morning Light")):
            print("Demo content already present — nothing to do.")
            return
        u = {x.email.split("@")[0]: x for x in db.scalars(select(User)).unique().all()}
        admin, c1, c2, v1, v2 = u["admin"], u["creator"], u["creator2"], u["viewer"], u["viewer2"]
        now = datetime.now(timezone.utc)

        c1.bio = "Daniel shares short reflections and community stories across traditions."
        c2.bio = "Priya makes music, meditation and interfaith dialogue."

        # ---- videos: (owner, file, title, description, category, status, age_hours)
        specs = [
            (c1, "morning-light.webm", "Morning Light", "A quiet reflection to start the day, whatever your tradition.", "Reflection", "approved", 30),
            (c2, "shared-table.webm", "The Shared Table", "What hospitality means in every faith I have visited.", "Community", "approved", 20),
            (c2, "song-of-gratitude.webm", "Song of Gratitude", "A short musical offering of thanks.", "Music", "approved", 10),
            (c1, "breath-and-stillness.webm", "Breath & Stillness", "A one-minute breathing pause.", "Wellness", "pending", 1),
        ]
        videos = []
        for owner, f, title, desc, cat, status, age in specs:
            a = _asset(db, owner, f)
            t = now - timedelta(hours=age)
            v = Video(owner_id=owner.id, asset_id=a.id, title=title, description=desc, category=cat, status=status,
                      created_at=t, published_at=t + timedelta(minutes=20) if status == "approved" else None)
            db.add(v)
            db.flush()
            videos.append(v)
            db.add(AuditLog(actor_id=owner.id, action="video.submit", entity_type="video", entity_id=v.id, details={"title": title}, created_at=t))
            if status == "approved":
                db.add(ModerationAction(admin_id=admin.id, target_type="video", target_id=v.id, target_title=title, action="approve",
                                        created_at=t + timedelta(minutes=20)))
                db.add(AuditLog(actor_id=admin.id, action="moderation.approve", entity_type="video", entity_id=v.id,
                                details={"title": title, "reason": None}, created_at=t + timedelta(minutes=20)))
                db.add(Notification(user_id=owner.id, type="approved", message=f"Your video “{title}” was approved and is now live.",
                                    link=f"/?v={v.id}", is_read=True, created_at=t + timedelta(minutes=20)))
        light, table, song, breath = videos

        # ---- engagement
        for viewer in (v1, v2, c2):
            db.add(Like(user_id=viewer.id, video_id=light.id))
        db.add(Like(user_id=v1.id, video_id=table.id))
        db.add(Like(user_id=v2.id, video_id=song.id))
        db.add(Like(user_id=c1.id, video_id=song.id))
        c = Comment(video_id=light.id, author_id=v1.id, body="This was exactly what I needed this morning. Thank you.", created_at=now - timedelta(hours=5))
        db.add(c)
        db.flush()
        db.add(Comment(video_id=light.id, author_id=c1.id, parent_id=c.id, body="Glad it found you, Vera 🙏", created_at=now - timedelta(hours=4)))
        db.add(Comment(video_id=table.id, author_id=v2.id, body="Beautiful reminder that a meal can be a prayer.", created_at=now - timedelta(hours=3)))
        db.add(Comment(video_id=song.id, author_id=c1.id, body="Lovely melody, Priya!", created_at=now - timedelta(hours=2)))
        db.add(Follow(follower_id=v1.id, followee_id=c1.id))
        db.add(Follow(follower_id=v1.id, followee_id=c2.id))
        db.add(Follow(follower_id=v2.id, followee_id=c2.id))

        # ---- podcasts
        shows = {
            "stillness": Podcast(owner_id=c1.id, title="Stillness Sessions", category="Wellness",
                                 description="Short guided pauses for the middle of a busy day."),
            "dialogue": Podcast(owner_id=c2.id, title="Open Door Dialogues", category="Interfaith",
                                description="Conversations between people of different traditions — and none."),
        }
        db.add_all(shows.values())
        db.flush()
        eps = [
            (c1, shows["stillness"], "stillness-ep1.mp3", "Episode 1 — Arriving", "Settle in and arrive in the present moment.", "approved", 26),
            (c1, shows["stillness"], "stillness-ep2.mp3", "Episode 2 — Letting go", "Practices for releasing what we cannot control.", "pending", 2),
            (c2, shows["dialogue"], "dialogue-ep1.mp3", "Episode 1 — Why we gather", "Why do people of different faiths gather at all?", "approved", 15),
        ]
        for owner, show, f, title, desc, status, age in eps:
            a = _asset(db, owner, f)
            t = now - timedelta(hours=age)
            e = Episode(podcast_id=show.id, asset_id=a.id, title=title, description=desc, status=status, created_at=t,
                        published_at=t + timedelta(minutes=15) if status == "approved" else None)
            db.add(e)
            db.flush()
            if status == "approved":
                db.add(ModerationAction(admin_id=admin.id, target_type="episode", target_id=e.id, target_title=title, action="approve",
                                        created_at=t + timedelta(minutes=15)))
                db.add(AuditLog(actor_id=admin.id, action="moderation.approve", entity_type="episode", entity_id=e.id,
                                details={"title": title, "reason": None}, created_at=t + timedelta(minutes=15)))

        # ---- notifications for the demo creator (unread, so the bell shows a count)
        db.add(Notification(user_id=c1.id, type="comment", message="Vera Viewer commented on “Morning Light”.", link=f"/?v={light.id}", created_at=now - timedelta(hours=5)))
        db.add(Notification(user_id=c1.id, type="follow", message="Vera Viewer started following you.", link=f"/profile/{v1.id}", created_at=now - timedelta(hours=6)))
        db.add(Notification(user_id=c2.id, type="comment", message="Victor Viewer commented on “The Shared Table”.", link=f"/?v={table.id}", created_at=now - timedelta(hours=3)))
        db.add(Notification(user_id=v1.id, type="reply", message="Daniel Creator replied to your comment on “Morning Light”.", link=f"/?v={light.id}", created_at=now - timedelta(hours=4)))

        # ---- one open report so the admin Reports page has content
        db.add(Report(reporter_id=v2.id, target_type="video", target_id=song.id, reason="Demo report: please review the audio levels.",
                      created_at=now - timedelta(minutes=30)))
        db.commit()
        print("Seeded demo content: 3 approved videos, 1 pending video, 2 podcasts (2 approved + 1 pending episode).")


if __name__ == "__main__":
    seed_demo()
    from .seed_podcast_video import main as seed_podcast_video

    seed_podcast_video()  # spoken video-podcast episode (approved)
