"""Seed demo content from backend/seed_media (real, playable files). Idempotent.

Run:  python -m app.seed_demo
Creates: 22 approved videos (including a 90-second video with thumbnail), 1 pending video,
episodes, comments/replies, likes, follows, a report, notifications and audit records.
"""
import hashlib
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select

from .config import BASE_DIR
from .db import SessionLocal
from .models import (
    AuditLog, Comment, Episode, Follow, Like, MediaAsset, ModerationAction, Notification, Podcast, Report, User, Video,
)
from .seed import seed
from .storage import path_for

MEDIA = BASE_DIR / "seed_media"
MIME = {".webm": ("video", "video/webm"), ".mp3": ("audio", "audio/mpeg"), ".png": ("image", "image/png")}


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
        u = {x.email.split("@")[0]: x for x in db.scalars(select(User)).unique().all()}
        admin, c1, c2, v1, v2 = u["admin"], u["creator"], u["creator2"], u["viewer"], u["viewer2"]
        now = datetime.now(timezone.utc)

        already_base = bool(db.scalar(select(Video).where(Video.title == "Morning Light")))
        if not already_base:
            c1.bio = "Daniel shares short reflections and community stories across traditions."
            c2.bio = "Priya makes music, meditation and interfaith dialogue."

            # ---- primary videos: (owner, file, thumb, dur_sec, title, description, category, status, age_hours)
            specs = [
                (c1, "ninety-second-journey.webm", "thumb-90s.png", 90, "Ninety-Second Faith Journey",
                 "A full 90-second contemplative visual journey across traditions.", "Reflection", "approved", 40),
                (c1, "morning-light.webm", "thumb-morning.png", 6, "Morning Light",
                 "A quiet reflection to start the day, whatever your tradition.", "Reflection", "approved", 30),
                (c2, "shared-table.webm", "thumb-table.png", 6, "The Shared Table",
                 "What hospitality means in every faith I have visited.", "Community", "approved", 20),
                (c2, "song-of-gratitude.webm", "thumb-song.png", 6, "Song of Gratitude",
                 "A short musical offering of thanks.", "Music", "approved", 10),
                (c1, "breath-and-stillness.webm", "thumb-breath.png", 6, "Breath & Stillness",
                 "A one-minute breathing pause.", "Wellness", "pending", 1),
            ]
            videos = []
            for owner, f, thumb_f, dur, title, desc, cat, status, age in specs:
                a = _asset(db, owner, f)
                th = _asset(db, owner, thumb_f) if (MEDIA / thumb_f).exists() else None
                t = now - timedelta(hours=age)
                v = Video(owner_id=owner.id, asset_id=a.id, thumbnail_asset_id=th.id if th else None,
                          duration_seconds=dur, title=title, description=desc, category=cat, status=status,
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
            _journey, light, table, song, _breath = videos

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

        # ---- ensure at least 22 approved videos exist so feed scrolling >= 20 videos is ready out of the box
        approved_count = db.scalar(select(func.count()).select_from(Video).where(Video.status == "approved")) or 0
        if approved_count < 22:
            extra_topics = [
                ("Lanterns at Dusk", "Evening prayers and candlelight reflections.", "Reflection", "morning-light.webm", "thumb-morning.png"),
                ("Voices in Harmony", "Choral chant shared across neighbors.", "Music", "song-of-gratitude.webm", "thumb-song.png"),
                ("Neighbors at Work", "Serving weekend meals at the community hall.", "Community", "shared-table.webm", "thumb-table.png"),
                ("Proverbs on Patience", "Ancient wisdom for turbulent days.", "Wisdom", "morning-light.webm", "thumb-morning.png"),
                ("Quiet Breathing", "Two minutes of mindful stillness.", "Wellness", "breath-and-stillness.webm", "thumb-breath.png"),
                ("Sacred Architecture", "Why light matters in houses of worship.", "Education", "shared-table.webm", "thumb-table.png"),
                ("Two Traditions, One Garden", "Planting an interfaith community orchard.", "Interfaith", "morning-light.webm", "thumb-morning.png"),
                ("Grandmother's Blessing", "Stories passed down around the hearth.", "Story", "song-of-gratitude.webm", "thumb-song.png"),
                ("Dawn Chorus", "Singing welcome to a new week.", "Music", "song-of-gratitude.webm", "thumb-song.png"),
                ("Listening Without Fixing", "How pastoral presence heals.", "Wisdom", "breath-and-stillness.webm", "thumb-breath.png"),
                ("Harvest Gratitude", "Celebrating the autumn table together.", "Community", "shared-table.webm", "thumb-table.png"),
                ("Pilgrim Steps", "Walking meditation on a quiet trail.", "Wellness", "morning-light.webm", "thumb-morning.png"),
                ("Calligraphy & Verse", "Art as contemplative devotion.", "Education", "song-of-gratitude.webm", "thumb-song.png"),
                ("Shared Sanctuary", "Opening doors during winter storms.", "Interfaith", "shared-table.webm", "thumb-table.png"),
                ("The Clay Lamp", "A short parable about small light.", "Story", "morning-light.webm", "thumb-morning.png"),
                ("Midday Pause", "Resetting attention before the afternoon.", "Reflection", "breath-and-stillness.webm", "thumb-breath.png"),
                ("Psalms in Acoustic", "Strings and voice in a wooden hall.", "Music", "song-of-gratitude.webm", "thumb-song.png"),
                ("Care for Elders", "Intergenerational visits on Sunday.", "Community", "shared-table.webm", "thumb-table.png"),
                ("Deep Roots", "Staying grounded in busy seasons.", "Wisdom", "morning-light.webm", "thumb-morning.png"),
            ]
            for idx, (title, desc, cat, clip_f, thumb_f) in enumerate(extra_topics):
                if approved_count >= 22:
                    break
                if db.scalar(select(Video).where(Video.title == title)):
                    continue
                owner = c1 if idx % 2 == 0 else c2
                a = _asset(db, owner, clip_f)
                th = _asset(db, owner, thumb_f) if (MEDIA / thumb_f).exists() else None
                t = now - timedelta(hours=50 + idx * 2)
                v = Video(
                    owner_id=owner.id, asset_id=a.id, thumbnail_asset_id=th.id if th else None,
                    duration_seconds=6, title=title, description=desc, category=cat, status="approved",
                    created_at=t, published_at=t + timedelta(minutes=10),
                )
                db.add(v)
                db.flush()
                db.add(ModerationAction(admin_id=admin.id, target_type="video", target_id=v.id, target_title=title,
                                        action="approve", created_at=t + timedelta(minutes=10)))
                approved_count += 1

        db.commit()
        total_approved = db.scalar(select(func.count()).select_from(Video).where(Video.status == "approved")) or 0
        print(f"Seeded demo content: {total_approved} approved videos (incl. 90s video with thumbnail), pending queue items, and podcasts.")


if __name__ == "__main__":
    seed_demo()
    from .seed_podcast_video import main as seed_podcast_video

    seed_podcast_video()  # spoken video-podcast episode (approved)
