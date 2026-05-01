from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/nas", tags=["nas"])


@router.get("", response_model=schemas.Paginated[schemas.NasOut])
def list_nas(
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> schemas.Paginated[schemas.NasOut]:
    base = select(models.Nas)
    if q:
        like = f"%{q}%"
        base = base.where(
            or_(
                models.Nas.nasname.like(like),
                models.Nas.shortname.like(like),
                models.Nas.description.like(like),
            )
        )
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = (
        db.execute(
            base.order_by(models.Nas.id).offset((page - 1) * page_size).limit(page_size)
        )
        .scalars()
        .all()
    )
    return schemas.Paginated[schemas.NasOut](
        items=[schemas.NasOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{nas_id}", response_model=schemas.NasOut)
def get_nas(nas_id: int, db: Session = Depends(get_db)) -> schemas.NasOut:
    row = db.get(models.Nas, nas_id)
    if not row:
        raise HTTPException(status_code=404, detail="NAS not found")
    return schemas.NasOut.model_validate(row)


@router.post("", response_model=schemas.NasOut, status_code=201)
def create_nas(payload: schemas.NasCreate, db: Session = Depends(get_db)) -> schemas.NasOut:
    row = models.Nas(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.NasOut.model_validate(row)


@router.patch("/{nas_id}", response_model=schemas.NasOut)
def update_nas(
    nas_id: int, payload: schemas.NasUpdate, db: Session = Depends(get_db)
) -> schemas.NasOut:
    row = db.get(models.Nas, nas_id)
    if not row:
        raise HTTPException(status_code=404, detail="NAS not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return schemas.NasOut.model_validate(row)


@router.delete("/{nas_id}", status_code=204)
def delete_nas(nas_id: int, db: Session = Depends(get_db)) -> None:
    row = db.get(models.Nas, nas_id)
    if not row:
        raise HTTPException(status_code=404, detail="NAS not found")
    db.delete(row)
    db.commit()
