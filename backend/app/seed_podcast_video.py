"""Add the two-person conversation video podcast (approved, owned by creator2). Idempotent.  Run: python -m app.seed_podcast_video"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .db import SessionLocal
from .models import AuditLog, Comment, Like, ModerationAction, Notification, User, Video
from .seed import seed
from .seed_demo import _asset

TITLE = "Faith Space Conversations — What does gratitude look like?"
OLD_TITLES = ["Open Door Dialogues — Why we gather (video podcast)"]  # superseded single-narrator demo


def main():
    seed()
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
