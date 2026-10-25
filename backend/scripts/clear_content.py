"""Delete all videos, podcasts, episodes and their activity (comments, likes, notifications, reports,
moderation/audit records) plus the media files. User accounts are kept.

Usage: python scripts/clear_content.py --yes
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    AuditLog, Comment, Episode, Follow, Like, MediaAsset, ModerationAction, Notification, Podcast, Report, User, Video,
)
from app.storage import delete_key  # noqa: E402

if "--yes" not in sys.argv:
    raise SystemExit("This deletes all content. Re-run with --yes to confirm.")

with SessionLocal() as db:
    # users keep their avatars; everything else in media_assets goes
    avatar_ids = {a for a in db.scalars(select(User.avatar_asset_id)) if a}
    keys = [a.storage_key for a in db.scalars(select(MediaAsset)).unique() if a.id not in avatar_ids]
    for model in (Comment, Like, Notification, Report, ModerationAction, AuditLog, Follow, Video, Episode, Podcast):
        db.execute(delete(model))
    db.execute(delete(MediaAsset).where(MediaAsset.id.notin_(avatar_ids or {-1})))
    db.commit()
for k in keys:
    delete_key(k)
print(f"Cleared content and {len(keys)} media files. Accounts kept.")
