from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _serialize(profile: models.Profile, user_count: int) -> schemas.ProfileOut:
    data = schemas.ProfileBase.model_validate(profile).model_dump()
    return schemas.ProfileOut(
        id=profile.id,
        user_count=user_count,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        **data,
    )


def _user_count_map(db: Session, profile_ids: list[int]) -> dict[int, int]:
    if not profile_ids:
        return {}
    rows = db.execute(
        select(
            models.SubscriberProfile.profile_id,
            func.count(models.SubscriberProfile.username),
        )
        .where(models.SubscriberProfile.profile_id.in_(profile_ids))
        .group_by(models.SubscriberProfile.profile_id)
    ).all()
    return {pid: int(cnt) for pid, cnt in rows}


@router.get("", response_model=schemas.Paginated[schemas.ProfileOut])
def list_profiles(
    q: str | None = None,
    enabled_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> schemas.Paginated[schemas.ProfileOut]:
    base_q = select(models.Profile)
    if q:
        like = f"%{q}%"
        base_q = base_q.where(models.Profile.name.like(like))
    if enabled_only:
        base_q = base_q.where(models.Profile.enabled.is_(True))

    total = db.execute(select(func.count()).select_from(base_q.subquery())).scalar_one()
    profiles = list(
        db.execute(
            base_q.order_by(models.Profile.name).offset((page - 1) * page_size).limit(page_size)
        )
        .scalars()
        .all()
    )
    counts = _user_count_map(db, [p.id for p in profiles])
    items = [_serialize(p, counts.get(p.id, 0)) for p in profiles]
    return schemas.Paginated[schemas.ProfileOut](
        items=items, total=total, page=page, page_size=page_size
    )


@router.get("/{profile_id}", response_model=schemas.ProfileOut)
def get_profile(profile_id: int, db: Session = Depends(get_db)) -> schemas.ProfileOut:
    profile = db.get(models.Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    counts = _user_count_map(db, [profile.id])
    return _serialize(profile, counts.get(profile.id, 0))


@router.post("", response_model=schemas.ProfileOut, status_code=201)
def create_profile(
    payload: schemas.ProfileCreate, db: Session = Depends(get_db)
) -> schemas.ProfileOut:
    existing = db.execute(
        select(models.Profile).where(models.Profile.name == payload.name)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="A profile with this name already exists")
    profile = models.Profile(**payload.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _serialize(profile, 0)


@router.patch("/{profile_id}", response_model=schemas.ProfileOut)
def update_profile(
    profile_id: int,
    payload: schemas.ProfileUpdate,
    db: Session = Depends(get_db),
) -> schemas.ProfileOut:
    profile = db.get(models.Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] != profile.name:
        clash = db.execute(
            select(models.Profile).where(
                models.Profile.name == fields["name"],
                models.Profile.id != profile.id,
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status_code=409, detail="A profile with this name already exists")
    for key, value in fields.items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    counts = _user_count_map(db, [profile.id])
    return _serialize(profile, counts.get(profile.id, 0))


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: int, db: Session = Depends(get_db)) -> None:
    profile = db.get(models.Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    in_use = db.execute(
        select(func.count()).select_from(
            select(models.SubscriberProfile)
            .where(models.SubscriberProfile.profile_id == profile.id)
            .subquery()
        )
    ).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete profile in use by {in_use} subscriber(s)",
        )
    db.delete(profile)
    db.commit()
