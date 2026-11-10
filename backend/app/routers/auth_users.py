from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..config import settings
from ..db import get_db
from ..deps import PageParams, admin_user, client_ip, current_user, err, optional_user
from ..models import Follow, MediaAsset, ModerationAction, Podcast, User, UserBlock, Video
from ..security import create_token, hash_password, limiter, verify_password
from ..services import audit, blocked_peer_ids, get_asset_owned, is_blocked_between, notify, user_out
from ..storage import delete_key

auth_router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


@auth_router.post("/register", response_model=s.TokenOut, status_code=201)
def register(body: s.RegisterIn, request: Request, db: Session = Depends(get_db)):
    limiter.check(f"reg:{client_ip(request)}", settings.login_rate_limit)
    if db.scalar(select(User).where(User.email == body.email)):
        raise err(409, "email_taken", "An account with that email already exists.")
    user = User(email=body.email, password_hash=hash_password(body.password), display_name=body.display_name, role=body.role)
    db.add(user)
    db.flush()
    audit(db, user, "user.register", "user", user.id)
    db.commit()
    return s.TokenOut(access_token=create_token(user.id, user.role), user=user_out(db, user, user, full=True))


@auth_router.post("/login", response_model=s.TokenOut)
def login(body: s.LoginIn, request: Request, db: Session = Depends(get_db)):
    limiter.check(f"login:{client_ip(request)}", settings.login_rate_limit)
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise err(401, "bad_credentials", "Incorrect email or password.")
    if not user.is_active:
        raise err(403, "suspended", "This account has been suspended.")
    audit(db, user, "user.login", "user", user.id)
    db.commit()
    return s.TokenOut(access_token=create_token(user.id, user.role), user=user_out(db, user, user, full=True))


@auth_router.get("/me", response_model=s.UserOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(db, user, user, full=True)


@users_router.get("", response_model=s.Page[s.UserOut])
def list_users(q: str | None = None, role: str | None = None, pg: PageParams = Depends(),
               admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    stmt = select(User)
    if q:
        stmt = stmt.where(User.display_name.ilike(f"%{q}%") | User.email.ilike(f"%{q}%"))
    if role:
        stmt = stmt.where(User.role == role)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.id).offset(pg.offset).limit(pg.page_size)).unique().all()
    return s.Page(items=[user_out(db, u, admin) for u in rows], total=total, page=pg.page, page_size=pg.page_size)


@users_router.patch("/me", response_model=s.UserOut)
def update_me(body: s.ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if "avatar_asset_id" in data:
        get_asset_owned(db, data["avatar_asset_id"], user, "image")
        user.avatar_asset_id = data["avatar_asset_id"]
    if data.get("display_name"):
        user.display_name = data["display_name"]
    if "bio" in data and data["bio"] is not None:
        user.bio = data["bio"]
    db.commit()
    db.refresh(user)
    return user_out(db, user, user, full=True)


@users_router.get("/search", response_model=list[s.UserOut])
def search_users(q: str = "", me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Find people to message (display-name match, active accounts, excludes yourself and blocked users)."""
    q = q.strip()
    if len(q) < 2:
        return []
    stmt = select(User).where(User.is_active.is_(True), User.id != me.id, User.display_name.ilike(f"%{q}%"))
    blocked = blocked_peer_ids(db, me.id)
    if blocked:
        stmt = stmt.where(User.id.notin_(blocked))
    rows = db.scalars(stmt.order_by(User.display_name).limit(10)).unique().all()
    return [user_out(db, u, me) for u in rows]


@users_router.get("/blocks", response_model=list[s.UserOut])
def list_blocked(me: User = Depends(current_user), db: Session = Depends(get_db)):
    """List users currently blocked by the authenticated user."""
    rows = db.scalars(
        select(User).join(UserBlock, UserBlock.blocked_id == User.id)
        .where(UserBlock.blocker_id == me.id).order_by(UserBlock.id.desc())
    ).unique().all()
    return [user_out(db, u, me) for u in rows]


@users_router.get("/{user_id}", response_model=s.UserOut)
def get_user(user_id: int, viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise err(404, "not_found", "User not found.")
    return user_out(db, u, viewer, full=True)


@users_router.patch("/{user_id}/status", response_model=s.UserOut)
def set_status(user_id: int, body: s.UserStatusIn, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise err(404, "not_found", "User not found.")
    if u.id == admin.id:
        raise err(400, "self_action", "You cannot change your own status.")
    u.is_active = body.is_active
    audit(db, admin, "user.activate" if body.is_active else "user.suspend", "user", u.id)
    db.commit()
    return user_out(db, u, admin)


@users_router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Permanently remove a user account and all of their content and media files."""
    u = db.get(User, user_id)
    if not u:
        raise err(404, "not_found", "User not found.")
    if u.id == admin.id:
        raise err(400, "self_action", "You cannot remove your own account.")
    if u.role == "admin":
        raise err(403, "forbidden", "Cannot remove another admin account.")

    keys = [a.storage_key for a in db.scalars(select(MediaAsset).where(MediaAsset.owner_id == u.id)).all()]
    u.avatar_asset_id = None
    db.flush()

    for v in db.scalars(select(Video).where(Video.owner_id == u.id)).unique().all():
        db.delete(v)
    for p in db.scalars(select(Podcast).where(Podcast.owner_id == u.id)).unique().all():
        db.delete(p)
    db.flush()

    db.execute(delete(MediaAsset).where(MediaAsset.owner_id == u.id))
    db.add(ModerationAction(admin_id=admin.id, target_type="user", target_id=u.id,
                            target_title=u.display_name[:200], action="delete", reason="Removed by admin"))
    audit(db, admin, "user.delete", "user", u.id, {"email": u.email, "display_name": u.display_name})
    db.delete(u)
    db.commit()
    for k in keys:
        delete_key(k)


@users_router.post("/{user_id}/follow", response_model=s.UserOut)
def follow(user_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise err(404, "not_found", "User not found.")
    if target.id == me.id:
        raise err(400, "self_follow", "You cannot follow yourself.")
    if is_blocked_between(db, me.id, target.id):
        raise err(403, "blocked", "Cannot follow this user while a block is active.")
    exists = db.scalar(select(Follow).where(Follow.follower_id == me.id, Follow.followee_id == target.id))
    if not exists:
        db.add(Follow(follower_id=me.id, followee_id=target.id))
        notify(db, target.id, "follow", f"{me.display_name} started following you.", f"/profile/{me.id}")
        db.commit()
    return user_out(db, target, me, full=True)


@users_router.delete("/{user_id}/follow", response_model=s.UserOut)
def unfollow(user_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise err(404, "not_found", "User not found.")
    row = db.scalar(select(Follow).where(Follow.follower_id == me.id, Follow.followee_id == target.id))
    if row:
        db.delete(row)
        db.commit()
    return user_out(db, target, me, full=True)


@users_router.post("/{user_id}/block", response_model=s.UserOut)
def block_user(user_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise err(404, "not_found", "User not found.")
    if target.id == me.id:
        raise err(400, "self_block", "You cannot block yourself.")
    exists = db.scalar(select(UserBlock).where(UserBlock.blocker_id == me.id, UserBlock.blocked_id == target.id))
    if not exists:
        db.add(UserBlock(blocker_id=me.id, blocked_id=target.id))
        # Remove any follows in either direction.
        db.execute(
            delete(Follow).where(
                or_(
                    (Follow.follower_id == me.id) & (Follow.followee_id == target.id),
                    (Follow.follower_id == target.id) & (Follow.followee_id == me.id),
                )
            )
        )
        audit(db, me, "user.block", "user", target.id, {"display_name": target.display_name})
        db.commit()
    return user_out(db, target, me, full=True)


@users_router.delete("/{user_id}/block", response_model=s.UserOut)
def unblock_user(user_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise err(404, "not_found", "User not found.")
    row = db.scalar(select(UserBlock).where(UserBlock.blocker_id == me.id, UserBlock.blocked_id == target.id))
    if row:
        db.delete(row)
        audit(db, me, "user.unblock", "user", target.id, {"display_name": target.display_name})
        db.commit()
    return user_out(db, target, me, full=True)
