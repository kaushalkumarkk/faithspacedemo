import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="fs-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["STORAGE_DIR"] = str(_tmp / "storage")
os.environ["LOGIN_RATE_LIMIT"] = "1000"
os.environ["BCRYPT_ROUNDS"] = "4"  # fast hashing for tests only
os.environ["MAX_VIDEO_MB"] = "1"  # keep the size-limit test cheap

import lameenc  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import limiter  # noqa: E402
from app.seed import DEMO_PASSWORD, seed  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed()
    limiter.reset()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def login(client: TestClient, who: str) -> dict:
    r = client.post("/auth/login", json={"email": f"{who}@faithspace.demo", "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return login(client, "admin")


@pytest.fixture
def creator(client):
    return login(client, "creator")


@pytest.fixture
def creator2(client):
    return login(client, "creator2")


@pytest.fixture
def viewer(client):
    return login(client, "viewer")


MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 2048
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 2048


def make_mp3() -> bytes:
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(22050)
    enc.set_channels(1)
    enc.set_quality(7)
    pcm = (b"\x00\x10\x00\xf0" * 11025)  # ~1s of low-amplitude square wave
    return bytes(enc.encode(pcm) + enc.flush())


@pytest.fixture
def mp3_bytes():
    return make_mp3()


def upload(client, headers, kind, name, data, ctype):
    return client.post("/uploads", headers=headers, data={"kind": kind}, files={"file": (name, data, ctype)})


@pytest.fixture
def pending_video(client, creator):
    """A real uploaded video submitted for moderation."""
    a = upload(client, creator, "video", "clip.mp4", MP4, "video/mp4").json()
    r = client.post("/videos", headers=creator, json={"asset_id": a["id"], "title": "Morning reflection", "description": "d", "category": "Reflection"})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def approved_video(client, admin, pending_video):
    r = client.post(f"/admin/moderation/video/{pending_video['id']}/approve", headers=admin)
    assert r.status_code == 200, r.text
    return pending_video
