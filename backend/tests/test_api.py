import pytest

from .conftest import MP4, WEBM, upload


# ---------- authentication ----------
def test_login_success_and_me(client, creator):
    r = client.get("/auth/me", headers=creator)
    assert r.status_code == 200 and r.json()["role"] == "creator"


def test_login_wrong_password(client):
    r = client.post("/auth/login", json={"email": "admin@faithspace.demo", "password": "nope-nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "bad_credentials"


def test_register_and_duplicate(client):
    body = {"email": "new@example.com", "password": "longenough1", "display_name": "New User", "role": "creator"}
    assert client.post("/auth/register", json=body).status_code == 201
    assert client.post("/auth/register", json=body).status_code == 409


def test_register_cannot_self_assign_admin(client):
    r = client.post("/auth/register", json={"email": "x@example.com", "password": "longenough1", "display_name": "Xx", "role": "admin"})
    assert r.status_code == 422


def test_protected_route_requires_token(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_password_is_hashed():
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import User

    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "admin@faithspace.demo"))
        assert u.password_hash.startswith("$2") and "Demo1234" not in u.password_hash


# ---------- unauthorized admin access ----------
@pytest.mark.parametrize("path", ["/admin/moderation/queue", "/admin/reports", "/admin/audit-logs", "/admin/overview",
                                  "/admin/comments", "/admin/moderation/history", "/users"])
def test_admin_routes_forbidden_for_non_admins(client, viewer, creator, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers=viewer).status_code == 403
    assert client.get(path, headers=creator).status_code == 403


def test_viewer_cannot_upload_video(client, viewer):
    assert upload(client, viewer, "video", "a.mp4", MP4, "video/mp4").status_code == 403


# ---------- creator upload & media retrieval ----------
def test_upload_validation(client, creator):
    assert upload(client, creator, "video", "a.exe", MP4, "video/mp4").status_code == 415
    assert upload(client, creator, "video", "a.mp4", b"MZ" + b"\x00" * 500, "video/mp4").json()["error"]["code"] == "bad_content"
    assert upload(client, creator, "video", "a.mp4", MP4, "text/html").json()["error"]["code"] == "bad_mime"
    assert upload(client, creator, "video", "a.mp4", b"", "video/mp4").status_code in (400, 415)
    big = MP4 + b"\x00" * (1024 * 1024 + 10)
    assert upload(client, creator, "video", "a.mp4", big, "video/mp4").json()["error"]["code"] == "too_large"


def test_upload_and_storage_key_not_a_path(client, creator):
    r = upload(client, creator, "video", "clip.webm", WEBM, "video/webm")
    assert r.status_code == 201
    url = r.json()["url"]
    assert url.startswith("/media/video/") and ":" not in url and "\\" not in url


def test_pending_media_hidden_from_public_but_visible_to_owner(client, creator, viewer, pending_video):
    url = pending_video["video_url"]
    assert client.get(url).status_code == 404
    assert client.get(url, headers=viewer).status_code == 404
    token = creator["Authorization"].split()[1]
    r = client.get(f"{url}?token={token}")
    assert r.status_code == 200 and r.content == MP4


def test_media_retrieval_and_range(client, approved_video):
    url = approved_video["video_url"]
    full = client.get(url)
    assert full.status_code == 200 and full.content == MP4 and full.headers["content-type"] == "video/mp4"
    part = client.get(url, headers={"Range": "bytes=0-9"})
    assert part.status_code == 206 and len(part.content) == 10


def test_path_traversal_blocked(client):
    assert client.get("/media/video/..%2f..%2fapp%2fconfig.py").status_code == 404


# ---------- moderation workflow ----------
def test_video_lifecycle_approve_hide_audit(client, creator, viewer, admin, pending_video):
    vid = pending_video["id"]
    assert pending_video["status"] == "pending"
    # not in public feed / not retrievable by viewers while pending
    assert client.get("/videos").json()["total"] == 0
    assert client.get(f"/videos/{vid}", headers=viewer).status_code == 404
    # appears in admin queue
    q = client.get("/admin/moderation/queue?status=pending", headers=admin).json()
    assert [i["id"] for i in q["items"]] == [vid]
    # approve -> public
    assert client.post(f"/admin/moderation/video/{vid}/approve", headers=admin).json()["status"] == "approved"
    feed = client.get("/videos", headers=viewer).json()
    assert feed["total"] == 1 and feed["items"][0]["id"] == vid
    assert client.get(pending_video["video_url"]).status_code == 200
    # hide -> gone from feed AND media is no longer public
    assert client.post(f"/admin/moderation/video/{vid}/hide", headers=admin, json={"reason": "review"}).status_code == 200
    assert client.get("/videos").json()["total"] == 0
    assert client.get(pending_video["video_url"]).status_code == 404
    # restore
    assert client.post(f"/admin/moderation/video/{vid}/restore", headers=admin).json()["status"] == "approved"
    assert client.get("/videos").json()["total"] == 1
    # audit trail + moderation history
    actions = [a["action"] for a in client.get("/admin/moderation/history", headers=admin).json()["items"]]
    assert actions == ["restore", "hide", "approve"]
    logs = [a["action"] for a in client.get("/admin/audit-logs?action=moderation", headers=admin).json()["items"]]
    assert "moderation.hide" in logs and "moderation.approve" in logs


def test_video_rejection_requires_reason_and_notifies(client, creator, admin, pending_video):
    vid = pending_video["id"]
    assert client.post(f"/admin/moderation/video/{vid}/reject", headers=admin, json={}).status_code == 422
    r = client.post(f"/admin/moderation/video/{vid}/reject", headers=admin, json={"reason": "Off-topic content"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert client.get("/videos").json()["total"] == 0
    mine = client.get("/videos/mine", headers=creator).json()[0]
    assert mine["status"] == "rejected" and mine["rejection_reason"] == "Off-topic content"
    notes = client.get("/notifications", headers=creator).json()["items"]
    assert notes[0]["type"] == "rejected" and "Off-topic content" in notes[0]["message"]


def test_invalid_transition(client, admin, pending_video):
    assert client.post(f"/admin/moderation/video/{pending_video['id']}/hide", headers=admin).status_code == 409


def test_only_owner_can_edit_or_delete_video(client, creator2, approved_video):
    vid = approved_video["id"]
    assert client.patch(f"/videos/{vid}", headers=creator2, json={"title": "Hijack"}).status_code == 403
    assert client.delete(f"/videos/{vid}", headers=creator2).status_code == 403


# ---------- likes & comments ----------
def test_like_unlike_persists(client, viewer, approved_video):
    vid = approved_video["id"]
    assert client.post(f"/videos/{vid}/likes", headers=viewer).json() == {"liked": True, "like_count": 1}
    assert client.post(f"/videos/{vid}/likes", headers=viewer).json()["like_count"] == 1  # idempotent
    v = client.get(f"/videos/{vid}", headers=viewer).json()
    assert v["liked_by_me"] is True and v["like_count"] == 1
    assert client.get(f"/videos/{vid}").json()["liked_by_me"] is False
    assert client.delete(f"/videos/{vid}/likes", headers=viewer).json() == {"liked": False, "like_count": 0}


def test_like_requires_auth(client, approved_video):
    assert client.post(f"/videos/{approved_video['id']}/likes").status_code == 401


def test_comments_replies_delete_and_notifications(client, creator, viewer, creator2, admin, approved_video):
    vid = approved_video["id"]
    c = client.post(f"/videos/{vid}/comments", headers=viewer, json={"body": "Beautiful, thank you."})
    assert c.status_code == 201
    cid = c.json()["id"]
    # creator is notified of the comment
    n = client.get("/notifications", headers=creator).json()["items"]
    assert any(x["type"] == "comment" for x in n)
    # reply notifies the comment author
    r = client.post(f"/videos/{vid}/comments", headers=creator, json={"body": "Glad you liked it", "parent_id": cid})
    assert r.status_code == 201
    n = client.get("/notifications", headers=viewer).json()["items"]
    assert n[0]["type"] == "reply"
    # persisted + threaded
    tree = client.get(f"/videos/{vid}/comments").json()
    assert len(tree) == 1 and tree[0]["replies"][0]["body"] == "Glad you liked it"
    assert client.get(f"/videos/{vid}").json()["comment_count"] == 2
    # ownership enforcement
    assert client.delete(f"/comments/{cid}", headers=creator2).status_code == 403
    assert client.delete(f"/comments/{cid}", headers=viewer).status_code == 204
    assert client.get(f"/videos/{vid}/comments").json() == []  # replies cascade
    # validation
    assert client.post(f"/videos/{vid}/comments", headers=viewer, json={"body": ""}).status_code == 422


def test_admin_can_delete_comment_and_it_is_recorded(client, viewer, admin, approved_video):
    cid = client.post(f"/videos/{approved_video['id']}/comments", headers=viewer, json={"body": "spam"}).json()["id"]
    assert client.delete(f"/comments/{cid}", headers=admin).status_code == 204
    h = client.get("/admin/moderation/history", headers=admin).json()["items"]
    assert any(a["target_type"] == "comment" and a["action"] == "delete" for a in h)


# ---------- podcasts ----------
def _make_episode(client, creator, mp3_bytes):
    p = client.post("/podcasts", headers=creator, json={"title": "Quiet Mornings", "description": "d", "category": "Wellness"})
    assert p.status_code == 201, p.text
    a = upload(client, creator, "audio", "ep1.mp3", mp3_bytes, "audio/mpeg")
    assert a.status_code == 201, a.text
    e = client.post("/episodes", headers=creator, json={"podcast_id": p.json()["id"], "asset_id": a.json()["id"], "title": "Episode One", "description": "x"})
    assert e.status_code == 201, e.text
    return p.json(), e.json()


def test_podcast_publish_play_and_search(client, creator, viewer, admin, mp3_bytes):
    p, e = _make_episode(client, creator, mp3_bytes)
    assert e["status"] == "pending"
    assert client.get("/episodes").json()["total"] == 0 and client.get("/podcasts").json()["total"] == 0
    assert client.get(f"/episodes/{e['id']}", headers=viewer).status_code == 404
    assert client.post(f"/admin/moderation/episode/{e['id']}/approve", headers=admin).status_code == 200
    assert client.get("/episodes?q=episode").json()["total"] == 1
    assert client.get("/episodes?q=zzz").json()["total"] == 0
    assert client.get("/podcasts").json()["total"] == 1
    audio = client.get(e["audio_url"], headers={"Range": "bytes=10-49"})
    assert audio.status_code == 206 and audio.content == mp3_bytes[10:50]
    assert client.get(e["audio_url"]).headers["content-type"] == "audio/mpeg"
    # rejection removes it from public view again
    client.post(f"/admin/moderation/episode/{e['id']}/hide", headers=admin)
    assert client.get("/episodes").json()["total"] == 0
    assert client.get(e["audio_url"]).status_code == 404


def test_episode_owner_edit_delete_permissions(client, creator, creator2, mp3_bytes):
    p, e = _make_episode(client, creator, mp3_bytes)
    assert client.patch(f"/episodes/{e['id']}", headers=creator2, json={"title": "x" * 5}).status_code == 403
    assert client.patch(f"/episodes/{e['id']}", headers=creator, json={"title": "Renamed ep"}).json()["title"] == "Renamed ep"
    assert client.delete(f"/episodes/{e['id']}", headers=creator2).status_code == 403
    assert client.delete(f"/episodes/{e['id']}", headers=creator).status_code == 204
    assert client.get("/episodes/mine", headers=creator).json() == []


def test_audio_upload_rejects_video_file(client, creator):
    assert upload(client, creator, "audio", "a.mp3", MP4, "audio/mpeg").json()["error"]["code"] == "bad_content"


# ---------- notifications ----------
def test_approval_notification_read_flow(client, creator, admin, pending_video):
    client.post(f"/admin/moderation/video/{pending_video['id']}/approve", headers=admin)
    assert client.get("/notifications/unread-count", headers=creator).json()["count"] == 1
    n = client.get("/notifications", headers=creator).json()["items"][0]
    assert n["type"] == "approved" and not n["is_read"]
    assert client.post(f"/notifications/{n['id']}/read", headers=creator).json()["is_read"] is True
    assert client.get("/notifications/unread-count", headers=creator).json()["count"] == 0
    # cannot touch somebody else's notification
    assert client.post(f"/notifications/{n['id']}/read", headers=admin).status_code == 404


def test_follow_creates_notification(client, viewer, creator):
    cid = client.get("/auth/me", headers=creator).json()["id"]
    assert client.post(f"/users/{cid}/follow", headers=viewer).json()["is_following"] is True
    assert client.post(f"/users/{cid}/follow", headers=viewer).json()["follower_count"] == 1
    assert client.get("/notifications", headers=creator).json()["items"][0]["type"] == "follow"
    assert client.delete(f"/users/{cid}/follow", headers=viewer).json()["follower_count"] == 0


# ---------- reports ----------
def test_report_flow(client, viewer, admin, approved_video):
    r = client.post("/reports", headers=viewer, json={"target_type": "video", "target_id": approved_video["id"], "reason": "Misleading"})
    assert r.status_code == 201
    assert client.post("/reports", headers=viewer, json={"target_type": "video", "target_id": approved_video["id"], "reason": "Misleading"}).status_code == 409
    items = client.get("/admin/reports", headers=admin).json()["items"]
    assert items[0]["target_title"] == "Morning reflection"
    assert client.post(f"/admin/reports/{items[0]['id']}/resolve", headers=admin, json={"resolution": "dismissed"}).status_code == 200
    assert client.get("/admin/reports", headers=admin).json()["total"] == 0


def test_structured_validation_error(client, creator):
    r = client.post("/videos", headers=creator, json={"asset_id": 1, "title": "x", "category": "Nope"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_pagination(client, admin, creator):
    for i in range(3):
        a = upload(client, creator, "video", "c.mp4", MP4 + bytes([i]), "video/mp4").json()
        v = client.post("/videos", headers=creator, json={"asset_id": a["id"], "title": f"Video {i}", "category": "Music"}).json()
        client.post(f"/admin/moderation/video/{v['id']}/approve", headers=admin)
    p = client.get("/videos?page=2&page_size=2").json()
    assert p["total"] == 3 and len(p["items"]) == 1
