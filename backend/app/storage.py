"""Media storage. Local-disk implementation behind a tiny interface so an S3 / Supabase
backend can be swapped in. Storage keys (never filesystem paths) are what the DB and API expose."""
import hashlib
import uuid
from pathlib import Path

from fastapi import UploadFile

from .config import settings
from .deps import err

# kind -> (allowed extensions -> canonical mime, max bytes)
RULES = {
    "video": ({".mp4": "video/mp4", ".webm": "video/webm"}, settings.max_video_mb),
    "audio": ({".mp3": "audio/mpeg", ".m4a": "audio/mp4"}, settings.max_audio_mb),
    "image": ({".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}, settings.max_image_mb),
}
# Browsers may report slightly different MIME types for the same format.
MIME_ALIASES = {
    "video/mp4": {"video/mp4"}, "video/webm": {"video/webm"},
    "audio/mpeg": {"audio/mpeg", "audio/mp3"}, "audio/mp4": {"audio/mp4", "audio/x-m4a", "audio/m4a", "video/mp4"},
    "image/png": {"image/png"}, "image/jpeg": {"image/jpeg"}, "image/webp": {"image/webp"},
}


def sniff_ok(mime: str, head: bytes) -> bool:
    """Verify magic bytes so a renamed .exe cannot masquerade as media."""
    if mime in ("video/mp4", "audio/mp4"):
        return head[4:8] == b"ftyp"
    if mime == "video/webm":
        return head[:4] == b"\x1a\x45\xdf\xa3"
    if mime == "audio/mpeg":
        return head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0)
    if mime == "image/png":
        return head[:8] == b"\x89PNG\r\n\x1a\n"
    if mime == "image/jpeg":
        return head[:3] == b"\xff\xd8\xff"
    if mime == "image/webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return False


def root() -> Path:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings.storage_dir


def path_for(key: str) -> Path:
    p = (root() / key).resolve()
    if not str(p).startswith(str(root().resolve())):  # path traversal guard
        raise err(400, "bad_key", "Invalid storage key.")
    return p


async def save_upload(kind: str, file: UploadFile) -> dict:
    if kind not in RULES:
        raise err(400, "bad_kind", "kind must be video, audio or image.")
    exts, max_mb = RULES[kind]
    name = file.filename or "upload"
    ext = Path(name).suffix.lower()
    if ext not in exts:
        raise err(415, "bad_extension", f"Unsupported file extension '{ext}'. Allowed: {', '.join(exts)}.")
    mime = exts[ext]
    declared = (file.content_type or "").split(";")[0].strip().lower()
    if declared and declared not in MIME_ALIASES[mime] and declared != "application/octet-stream":
        raise err(415, "bad_mime", f"Content type '{declared}' does not match a {ext} file.")

    key = f"{kind}/{uuid.uuid4().hex}{ext}"
    dest = path_for(key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    limit = max_mb * 1024 * 1024
    size, sha, head = 0, hashlib.sha256(), b""
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                if not head:
                    head = chunk[:16]
                    if not sniff_ok(mime, head):
                        raise err(415, "bad_content", "File content does not match its extension.")
                size += len(chunk)
                if size > limit:
                    raise err(413, "too_large", f"File exceeds the {max_mb} MB limit for {kind} uploads.")
                sha.update(chunk)
                out.write(chunk)
        if size == 0:
            raise err(400, "empty_file", "The uploaded file is empty.")
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return {"key": key, "mime": mime, "size": size, "sha256": sha.hexdigest(), "filename": name[:255]}


def delete_key(key: str):
    path_for(key).unlink(missing_ok=True)
