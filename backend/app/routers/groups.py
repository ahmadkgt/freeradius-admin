from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, func, select, union
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/groups", tags=["groups"])


def _all_group_names_subquery():
    return union(
        select(models.RadGroupCheck.groupname.label("groupname")),
        select(models.RadGroupReply.groupname.label("groupname")),
        select(models.RadUserGroup.groupname.label("groupname")),
    ).subquery()


@router.get("", response_model=schemas.Paginated[schemas.GroupSummary])
def list_groups(
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> schemas.Paginated[schemas.GroupSummary]:
    sub = _all_group_names_subquery()
    base = select(distinct(sub.c.groupname)).where(sub.c.groupname != "")
    if q:
        base = base.where(sub.c.groupname.like(f"%{q}%"))
    base = base.order_by(sub.c.groupname)

    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    names = db.execute(base.offset((page - 1) * page_size).limit(page_size)).scalars().all()

    items: list[schemas.GroupSummary] = []
    for name in names:
        count = db.execute(
            select(func.count()).where(models.RadUserGroup.groupname == name)
        ).scalar_one()
        items.append(schemas.GroupSummary(groupname=name, user_count=count))

    return schemas.Paginated[schemas.GroupSummary](
        items=items, total=total, page=page, page_size=page_size
    )


@router.get("/{groupname}", response_model=schemas.GroupDetail)
def get_group(groupname: str, db: Session = Depends(get_db)) -> schemas.GroupDetail:
    check = list(
        db.execute(
            select(models.RadGroupCheck).where(models.RadGroupCheck.groupname == groupname)
        ).scalars().all()
    )
    reply = list(
        db.execute(
            select(models.RadGroupReply).where(models.RadGroupReply.groupname == groupname)
        ).scalars().all()
    )
    members = list(
        db.execute(
            select(models.RadUserGroup.username).where(models.RadUserGroup.groupname == groupname)
        ).scalars().all()
    )
    if not (check or reply or members):
        raise HTTPException(status_code=404, detail="Group not found")
    return schemas.GroupDetail(
        groupname=groupname,
        check_attrs=[schemas.GroupCheckAttr.model_validate(c) for c in check],
        reply_attrs=[schemas.GroupReplyAttr.model_validate(r) for r in reply],
        members=members,
    )


@router.post("", response_model=schemas.GroupDetail, status_code=201)
def create_group(
    payload: schemas.GroupCreate, db: Session = Depends(get_db)
) -> schemas.GroupDetail:
    sub = _all_group_names_subquery()
    existing = db.execute(
        select(sub.c.groupname).where(sub.c.groupname == payload.groupname).limit(1)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Group already exists")
    db.add(
        models.RadGroupCheck(
            groupname=payload.groupname, attribute="Auth-Type", op=":=", value="PAP"
        )
    )
    db.commit()
    return get_group(payload.groupname, db)


@router.delete("/{groupname}", status_code=204)
def delete_group(groupname: str, db: Session = Depends(get_db)) -> None:
    db.execute(
        models.RadGroupCheck.__table__.delete().where(
            models.RadGroupCheck.groupname == groupname
        )
    )
    db.execute(
        models.RadGroupReply.__table__.delete().where(
            models.RadGroupReply.groupname == groupname
        )
    )
    db.execute(
        models.RadUserGroup.__table__.delete().where(models.RadUserGroup.groupname == groupname)
    )
    db.commit()


@router.post("/{groupname}/check", response_model=schemas.GroupCheckAttr, status_code=201)
def add_group_check(
    groupname: str, payload: schemas.AttrCreate, db: Session = Depends(get_db)
) -> schemas.GroupCheckAttr:
    row = models.RadGroupCheck(
        groupname=groupname, attribute=payload.attribute, op=payload.op, value=payload.value
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.GroupCheckAttr.model_validate(row)


@router.delete("/{groupname}/check/{attr_id}", status_code=204)
def del_group_check(groupname: str, attr_id: int, db: Session = Depends(get_db)) -> None:
    row = db.get(models.RadGroupCheck, attr_id)
    if not row or row.groupname != groupname:
        raise HTTPException(status_code=404, detail="Attribute not found")
    db.delete(row)
    db.commit()


@router.post("/{groupname}/reply", response_model=schemas.GroupReplyAttr, status_code=201)
def add_group_reply(
    groupname: str, payload: schemas.AttrCreate, db: Session = Depends(get_db)
) -> schemas.GroupReplyAttr:
    row = models.RadGroupReply(
        groupname=groupname, attribute=payload.attribute, op=payload.op, value=payload.value
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.GroupReplyAttr.model_validate(row)


@router.delete("/{groupname}/reply/{attr_id}", status_code=204)
def del_group_reply(groupname: str, attr_id: int, db: Session = Depends(get_db)) -> None:
    row = db.get(models.RadGroupReply, attr_id)
    if not row or row.groupname != groupname:
        raise HTTPException(status_code=404, detail="Attribute not found")
    db.delete(row)
    db.commit()
