"""Add the two-person conversation video podcast (approved, owned by creator2). Idempotent.  Run: python -m app.seed_podcast_video"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .db import SessionLocal
from .models import AuditLog, Comment, Episode, Like, Message, ModerationAction, Notification, Podcast, User, Video
from .seed import seed
from .seed_demo import _asset

TITLE = "Faith Space Conversations — What does gratitude look like?"
OLD_TITLES = ["Open Door Dialogues — Why we gather (video podcast)"]  # superseded single-narrator demo


EP_TITLE = "Episode 2 — Why we gather (video conversation)"


def seed_video_episode():
    """Same two-person conversation, published as a VIDEO episode in the Podcasts section."""
    with SessionLocal() as db:
        if db.scalar(select(Episode).where(Episode.title == EP_TITLE)):
            return
        show = db.scalar(select(Podcast).where(Podcast.title == "Open Door Dialogues"))
        if not show:
            return
        t = datetime.now(timezone.utc) - timedelta(minutes=30)
        asset = _asset(db, show.owner, "gratitude-conversation.webm")
        e = Episode(podcast_id=show.id, asset_id=asset.id, title=EP_TITLE, status="approved", created_at=t, published_at=t + timedelta(minutes=5),
                    description="Priya and Daniel talk about gratitude across traditions. Video episode with live captions (synthesized voices).")
        db.add(e)
        db.flush()
        admin = db.scalar(select(User).where(User.email == "admin@faithspace.demo"))
        db.add(ModerationAction(admin_id=admin.id, target_type="episode", target_id=e.id, target_title=EP_TITLE, action="approve", created_at=t + timedelta(minutes=5)))
        db.add(AuditLog(actor_id=admin.id, action="moderation.approve", entity_type="episode", entity_id=e.id, details={"title": EP_TITLE, "reason": None}, created_at=t + timedelta(minutes=5)))
        db.commit()
        print("Added video episode:", EP_TITLE)


COVERS = {"Stillness Sessions": "cover-stillness.png", "Open Door Dialogues": "cover-open-door.png"}


def seed_covers():
    """Attach generated cover art to the demo shows that have none yet."""
    with SessionLocal() as db:
        for title, f in COVERS.items():
            show = db.scalar(select(Podcast).where(Podcast.title == title))
            if show and not show.cover_asset_id:
                show.cover_asset_id = _asset(db, show.owner, f).id
                print("Cover added:", title)
        db.commit()


def seed_messages():
    """A short sample conversation between the demo viewer and creator (one unread message for the creator)."""
    with SessionLocal() as db:
        if db.scalar(select(Message)):
            return
        by = {u.email.split("@")[0]: u for u in db.scalars(select(User)).unique()}
        v, c = by["viewer"], by["creator"]
        now = datetime.now(timezone.utc)
        read = now - timedelta(hours=1)
        db.add_all([
            Message(sender_id=v.id, recipient_id=c.id, body="Hi Daniel, loved your Morning Light reflection!", created_at=now - timedelta(hours=3), read_at=read),
            Message(sender_id=c.id, recipient_id=v.id, body="Thank you, Vera! That means a lot. Anything you'd like me to cover next?", created_at=now - timedelta(hours=2), read_at=read),
            Message(sender_id=v.id, recipient_id=c.id, body="Maybe something on gratitude across traditions?", created_at=now - timedelta(minutes=20)),
        ])
        db.commit()
        print("Seeded sample messages")


def main():
    seed()
    seed_messages()
    seed_video_episode()
    seed_covers()
    with SessionLocal() as db:
        if db.scalar(select(Video).where(Video.title == TITLE)):
            print("Video podcast already present.")
            return
        from .models import MediaAsset
        from .storage import delete_key

        for old in db.scalars(select(Video).where(Video.title.in_(OLD_TITLES))).unique().all():
            asset = old.asset
            db.delete(old)
            db.flush()
            db.delete(asset)
            db.commit()
            delete_key(asset.storage_key)
            print("Removed superseded demo video:", old.title)
        by = {u.email.split("@")[0]: u for u in db.scalars(select(User)).unique()}
        admin, host, viewer = by["admin"], by["creator2"], by["viewer"]
        t = datetime.now(timezone.utc) - timedelta(minutes=45)
        asset = _asset(db, host, "gratitude-conversation.webm")
        v = Video(owner_id=host.id, asset_id=asset.id, title=TITLE, category="Interfaith", status="approved", created_at=t,
                  published_at=t + timedelta(minutes=5),
                  description="Priya and Daniel talk about how different traditions say thank you. A two-person conversation with live captions (synthesized voices).")
        db.add(v)
        db.flush()
        db.add(AuditLog(actor_id=host.id, action="video.submit", entity_type="video", entity_id=v.id, details={"title": TITLE}, created_at=t))
        db.add(ModerationAction(admin_id=admin.id, target_type="video", target_id=v.id, target_title=TITLE, action="approve", created_at=t + timedelta(minutes=5)))
        db.add(AuditLog(actor_id=admin.id, action="moderation.approve", entity_type="video", entity_id=v.id, details={"title": TITLE, "reason": None}, created_at=t + timedelta(minutes=5)))
        db.add(Notification(user_id=host.id, type="approved", message=f"Your video “{TITLE}” was approved and is now live.", link=f"/?v={v.id}", is_read=True, created_at=t + timedelta(minutes=5)))
        db.add(Like(user_id=viewer.id, video_id=v.id))
        db.add(Comment(video_id=v.id, author_id=viewer.id, body="Loved the idea of specific thanks. I called my sister tonight!"))
        db.commit()
        print("Added video podcast:", TITLE)


if __name__ == "__main__":
    main()
