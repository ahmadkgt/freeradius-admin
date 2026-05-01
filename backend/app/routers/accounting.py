from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/accounting", tags=["accounting"])


@router.get("/sessions", response_model=schemas.Paginated[schemas.AccountingRow])
def list_sessions(
    q: str | None = None,
    active_only: bool = False,
    username: str | None = None,
    nas: str | None = None,
    start_after: datetime | None = None,
    start_before: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> schemas.Paginated[schemas.AccountingRow]:
    base = select(models.RadAcct)
    if active_only:
        base = base.where(models.RadAcct.acctstoptime.is_(None))
    if username:
        base = base.where(models.RadAcct.username == username)
    if nas:
        base = base.where(models.RadAcct.nasipaddress == nas)
    if start_after:
        base = base.where(models.RadAcct.acctstarttime >= start_after)
    if start_before:
        base = base.where(models.RadAcct.acctstarttime <= start_before)
    if q:
        like = f"%{q}%"
        base = base.where(
            or_(
                models.RadAcct.username.like(like),
                models.RadAcct.framedipaddress.like(like),
                models.RadAcct.callingstationid.like(like),
                models.RadAcct.nasipaddress.like(like),
            )
        )
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = (
        db.execute(
            base.order_by(desc(models.RadAcct.acctstarttime))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return schemas.Paginated[schemas.AccountingRow](
        items=[schemas.AccountingRow.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/postauth", response_model=schemas.Paginated[schemas.PostAuthRow])
def list_postauth(
    q: str | None = None,
    reply: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> schemas.Paginated[schemas.PostAuthRow]:
    base = select(models.RadPostAuth)
    if q:
        base = base.where(models.RadPostAuth.username.like(f"%{q}%"))
    if reply:
        base = base.where(models.RadPostAuth.reply == reply)
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = (
        db.execute(
            base.order_by(desc(models.RadPostAuth.authdate))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return schemas.Paginated[schemas.PostAuthRow](
        items=[schemas.PostAuthRow.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
