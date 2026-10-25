from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..config import settings
from ..db import get_db
from ..deps import _user_from_token, bearer, current_user, err, optional_user
from ..models import Episode, MediaAsset, Podcast, User, Video
from ..security import limiter
from ..storage import delete_key, path_for, save_upload

uploads_router = APIRouter(prefix="/uploads", tags=["uploads"])
media_router = APIRouter(tags=["media"])


@uploads_router.post("", response_model=s.AssetOut, status_code=201)
async def upload(kind: str = Form(...), file: UploadFile = File(...),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Direct backend upload (local demo). Production: swap for a presigned direct-to-storage URL."""
    if kind in ("video", "audio") and user.role not in ("creator", "admin"):
        raise err(403, "forbidden", "Only creators can upload video or audio.")
    limiter.check(f"upload:{user.id}", settings.upload_rate_limit)
    info = await save_upload(kind, file)
    asset = MediaAsset(
        owner_id=user.id, kind=kind, storage_key=info["key"], original_filename=info["filename"],
        mime_type=info["mime"], size_bytes=info["size"], sha256=info["sha256"],
    )
    try:
        db.add(asset)
        db.commit()
    except Exception:
        db.rollback()
        delete_key(info["key"])
        raise
    return s.AssetOut(id=asset.id, kind=kind, url=s.media_url(asset), mime_type=asset.mime_type,
                      size_bytes=asset.size_bytes, original_filename=asset.original_filename)


@uploads_router.get("/limits")
def limits():
    return {"video_mb": settings.max_video_mb, "audio_mb": settings.max_audio_mb, "image_mb": settings.max_image_mb,
            "video_types": ["video/mp4", "video/webm"], "audio_types": ["audio/mpeg", "audio/mp4"]}


@media_router.get("/media/{kind}/{name}")
def serve_media(kind: str, name: str, token: str | None = None, db: Session = Depends(get_db),
                creds=Depends(bearer)):
    """Serves media with HTTP Range support (via FileResponse). Unapproved media is visible only to
    its owner and admins; <video>/<audio> tags cannot send headers so a ?token= query is accepted."""
    key = f"{kind}/{name}"
    asset = db.scalar(select(MediaAsset).where(MediaAsset.storage_key == key))
    if not asset:
        raise err(404, "not_found", "Media not found.")

    public = False
    if asset.kind == "image":
        public = True  # avatars / covers are public; image uploads are not otherwise exposed
    else:
        v = db.scalar(select(Video).where(Video.asset_id == asset.id))
        e = db.scalar(select(Episode).where(Episode.asset_id == asset.id))
        item = v or e
        public = bool(item and item.status == "approved")
    if not public:
        viewer = _user_from_token(db, token or (creds.credentials if creds else None))
        if not viewer or (viewer.id != asset.owner_id and viewer.role != "admin"):
            raise err(404, "not_found", "Media not found.")  # 404, not 403: do not leak existence
    path = path_for(key)
    if not path.exists():
        raise err(404, "missing_file", "Media file is missing from storage.")
    return FileResponse(path, media_type=asset.mime_type, headers={"Cache-Control": "private, max-age=300" if not public else "public, max-age=300",
                                                                      "X-Content-Type-Options": "nosniff"})
