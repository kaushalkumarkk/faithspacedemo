from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..deps import PageParams, creator_user, current_user, err, optional_user
from ..models import Episode, Podcast, User
from ..services import audit, episode_out, get_asset_owned, podcast_out
from ..storage import delete_key

podcasts_router = APIRouter(prefix="/podcasts", tags=["podcasts"])
episodes_router = APIRouter(prefix="/episodes", tags=["episodes"])


def _can_see(e: Episode, viewer: User | None) -> bool:
    return e.status == "approved" or bool(viewer and (viewer.role == "admin" or viewer.id == e.podcast.owner_id))


@podcasts_router.get("", response_model=s.Page[s.PodcastOut])
def list_podcasts(q: str | None = None, category: str | None = None, pg: PageParams = Depends(), db: Session = Depends(get_db)):
    """Browse shows that have at least one approved episode."""
    has_ep = select(Episode.podcast_id).where(Episode.status == "approved")
    stmt = select(Podcast).where(Podcast.id.in_(has_ep))
    if q:
        stmt = stmt.where(Podcast.title.ilike(f"%{q}%") | Podcast.description.ilike(f"%{q}%"))
    if category:
        stmt = stmt.where(Podcast.category == category)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Podcast.id.desc()).offset(pg.offset).limit(pg.page_size)).unique().all()
    return s.Page(items=[podcast_out(db, p) for p in rows], total=total, page=pg.page, page_size=pg.page_size)


@podcasts_router.get("/mine", response_model=list[s.PodcastOut])
def my_podcasts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Podcast).where(Podcast.owner_id == user.id).order_by(Podcast.id.desc())).unique().all()
    return [podcast_out(db, p, public_only=False) for p in rows]


@podcasts_router.post("", response_model=s.PodcastOut, status_code=201)
def create_podcast(body: s.PodcastCreate, user: User = Depends(creator_user), db: Session = Depends(get_db)):
    cover = get_asset_owned(db, body.cover_asset_id, user, "image")
    p = Podcast(owner_id=user.id, title=body.title.strip(), description=body.description.strip(), category=body.category,
                cover_asset_id=cover.id if cover else None)
    db.add(p)
    db.flush()
    audit(db, user, "podcast.create", "podcast", p.id)
    db.commit()
    return podcast_out(db, p, public_only=False)


@podcasts_router.get("/{podcast_id}")
def get_podcast(podcast_id: int, viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    p = db.get(Podcast, podcast_id)
    if not p:
        raise err(404, "not_found", "Podcast not found.")
    eps = db.scalars(select(Episode).where(Episode.podcast_id == p.id).order_by(Episode.id.desc())).unique().all()
    return {"podcast": podcast_out(db, p, public_only=not (viewer and (viewer.id == p.owner_id or viewer.role == "admin"))),
            "episodes": [episode_out(db, e) for e in eps if _can_see(e, viewer)]}


@podcasts_router.patch("/{podcast_id}", response_model=s.PodcastOut)
def update_podcast(podcast_id: int, body: s.PodcastUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Podcast, podcast_id)
    if not p:
        raise err(404, "not_found", "Podcast not found.")
    if p.owner_id != user.id:
        raise err(403, "forbidden", "You can only edit your own podcasts.")
    data = body.model_dump(exclude_unset=True)
    if "cover_asset_id" in data:
        get_asset_owned(db, data.pop("cover_asset_id"), user, "image")  # validates ownership
        p.cover_asset_id = body.cover_asset_id
    for k, v in data.items():
        if v is not None:
            setattr(p, k, v)
    db.commit()
    return podcast_out(db, p, public_only=False)


@podcasts_router.delete("/{podcast_id}", status_code=204)
def delete_podcast(podcast_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Podcast, podcast_id)
    if not p:
        raise err(404, "not_found", "Podcast not found.")
    if p.owner_id != user.id and user.role != "admin":
        raise err(403, "forbidden", "You can only delete your own podcasts.")
    assets = [e.asset for e in p.episodes]
    audit(db, user, "podcast.delete", "podcast", p.id, {"title": p.title})
    db.delete(p)
    db.flush()
    for a in assets:
        db.delete(a)
    db.commit()
    for a in assets:
        delete_key(a.storage_key)


# ---------- episodes ----------
@episodes_router.get("", response_model=s.Page[s.EpisodeOut])
def list_episodes(q: str | None = None, category: str | None = None, podcast_id: int | None = None,
                  pg: PageParams = Depends(), db: Session = Depends(get_db)):
    stmt = select(Episode).join(Podcast).where(Episode.status == "approved")
    if q:
        stmt = stmt.where(Episode.title.ilike(f"%{q}%") | Episode.description.ilike(f"%{q}%") | Podcast.title.ilike(f"%{q}%"))
    if category:
        stmt = stmt.where(Podcast.category == category)
    if podcast_id:
        stmt = stmt.where(Episode.podcast_id == podcast_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Episode.published_at.desc(), Episode.id.desc()).offset(pg.offset).limit(pg.page_size)).unique().all()
    return s.Page(items=[episode_out(db, e) for e in rows], total=total, page=pg.page, page_size=pg.page_size)


@episodes_router.get("/mine", response_model=list[s.EpisodeOut])
def my_episodes(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Episode).join(Podcast).where(Podcast.owner_id == user.id).order_by(Episode.id.desc())).unique().all()
    return [episode_out(db, e) for e in rows]


@episodes_router.post("", response_model=s.EpisodeOut, status_code=201)
def create_episode(body: s.EpisodeCreate, user: User = Depends(creator_user), db: Session = Depends(get_db)):
    p = db.get(Podcast, body.podcast_id)
    if not p or p.owner_id != user.id:
        raise err(403 if p else 404, "forbidden" if p else "not_found", "Podcast not found or not yours.")
    asset = get_asset_owned(db, body.asset_id, user, "audio")
    if db.scalar(select(Episode).where(Episode.asset_id == asset.id)):
        raise err(409, "asset_used", "That upload is already attached to an episode.")
    e = Episode(podcast_id=p.id, asset_id=asset.id, title=body.title.strip(), description=body.description.strip(), status="pending")
    db.add(e)
    db.flush()
    audit(db, user, "episode.submit", "episode", e.id, {"title": e.title})
    db.commit()
    db.refresh(e)
    return episode_out(db, e)


@episodes_router.get("/{episode_id}", response_model=s.EpisodeOut)
def get_episode(episode_id: int, viewer: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    e = db.get(Episode, episode_id)
    if not e or not _can_see(e, viewer):
        raise err(404, "not_found", "Episode not found.")
    return episode_out(db, e)


@episodes_router.patch("/{episode_id}", response_model=s.EpisodeOut)
def update_episode(episode_id: int, body: s.EpisodeUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = db.get(Episode, episode_id)
    if not e:
        raise err(404, "not_found", "Episode not found.")
    if e.podcast.owner_id != user.id:
        raise err(403, "forbidden", "You can only edit your own episodes.")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(e, k, v.strip())
    if e.status == "approved":
        e.status, e.published_at = "pending", None
    db.commit()
    return episode_out(db, e)


@episodes_router.delete("/{episode_id}", status_code=204)
def delete_episode(episode_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = db.get(Episode, episode_id)
    if not e:
        raise err(404, "not_found", "Episode not found.")
    if e.podcast.owner_id != user.id and user.role != "admin":
        raise err(403, "forbidden", "You can only delete your own episodes.")
    asset = e.asset
    audit(db, user, "episode.delete", "episode", e.id, {"title": e.title})
    db.delete(e)
    db.flush()
    db.delete(asset)
    db.commit()
    delete_key(asset.storage_key)
