"""Seed demo accounts. Idempotent. Run: python -m app.seed

No fake media is seeded on purpose — the demo content is created live through the UI.
"""
from sqlalchemy import select

from .db import SessionLocal
from .models import User
from .security import hash_password

DEMO_PASSWORD = "Demo1234!"
ACCOUNTS = [
    ("admin@faithspace.demo", "Amara Admin", "admin", "Moderator of the Faith Space demo community."),
    ("creator@faithspace.demo", "Daniel Creator", "creator", "Sharing reflections and conversations across traditions."),
    ("creator2@faithspace.demo", "Priya Creator", "creator", "Music, meditation and interfaith dialogue."),
    ("viewer@faithspace.demo", "Vera Viewer", "viewer", "Curious about every tradition."),
    ("viewer2@faithspace.demo", "Victor Viewer", "viewer", "Here to listen and learn."),
]


def seed() -> int:
    created = 0
    with SessionLocal() as db:
        for email, name, role, bio in ACCOUNTS:
            if not db.scalar(select(User).where(User.email == email)):
                db.add(User(email=email, display_name=name, role=role, bio=bio, password_hash=hash_password(DEMO_PASSWORD)))
                created += 1
        db.commit()
    return created


if __name__ == "__main__":
    print(f"Seeded {seed()} new demo accounts (password: {DEMO_PASSWORD})")
