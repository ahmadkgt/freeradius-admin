from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=schemas.Paginated[schemas.UserSummary])
def list_users(
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> schemas.Paginated[schemas.UserSummary]:
    base_q = select(distinct(models.RadCheck.username)).where(models.RadCheck.username != "")
    if q:
        like = f"%{q}%"
        base_q = base_q.where(models.RadCheck.username.like(like))
    base_q = base_q.order_by(models.RadCheck.username)

    total = db.execute(
        select(func.count()).select_from(base_q.subquery())
    ).scalar_one()
    usernames = db.execute(base_q.offset((page - 1) * page_size).limit(page_size)).scalars().all()

    items: list[schemas.UserSummary] = []
    for username in usernames:
        password_row = db.execute(
            select(models.RadCheck.value).where(
                models.RadCheck.username == username,
                models.RadCheck.attribute.in_(["Cleartext-Password", "Password", "User-Password"]),
            ).limit(1)
        ).scalar_one_or_none()

        groups = list(
            db.execute(
                select(models.RadUserGroup.groupname).where(
                    models.RadUserGroup.username == username
                )
            ).scalars().all()
        )

        framed_ip = db.execute(
            select(models.RadReply.value).where(
                models.RadReply.username == username,
                models.RadReply.attribute == "Framed-IP-Address",
            ).limit(1)
        ).scalar_one_or_none()

        items.append(
            schemas.UserSummary(
                username=username,
                password=password_row,
                groups=groups,
                framed_ip=framed_ip,
            )
        )

    return schemas.Paginated[schemas.UserSummary](
        items=items, total=total, page=page, page_size=page_size
    )


@router.get("/{username}", response_model=schemas.UserDetail)
def get_user(username: str, db: Session = Depends(get_db)) -> schemas.UserDetail:
    check_attrs = list(
        db.execute(
            select(models.RadCheck).where(models.RadCheck.username == username)
        ).scalars().all()
    )
    if not check_attrs:
        raise HTTPException(status_code=404, detail="User not found")
    reply_attrs = list(
        db.execute(
            select(models.RadReply).where(models.RadReply.username == username)
        ).scalars().all()
    )
    groups = list(
        db.execute(
            select(models.RadUserGroup.groupname).where(
                models.RadUserGroup.username == username
            )
        ).scalars().all()
    )
    password = next(
        (
            a.value
            for a in check_attrs
            if a.attribute in ("Cleartext-Password", "Password", "User-Password")
        ),
        None,
    )
    return schemas.UserDetail(
        username=username,
        password=password,
        groups=groups,
        check_attrs=[schemas.CheckAttr.model_validate(c) for c in check_attrs],
        reply_attrs=[schemas.ReplyAttr.model_validate(r) for r in reply_attrs],
    )


@router.post("", response_model=schemas.UserDetail, status_code=201)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)) -> schemas.UserDetail:
    existing = db.execute(
        select(models.RadCheck).where(models.RadCheck.username == payload.username).limit(1)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")

    db.add(
        models.RadCheck(
            username=payload.username,
            attribute="Cleartext-Password",
            op=":=",
            value=payload.password,
        )
    )
    if payload.framed_ip:
        db.add(
            models.RadReply(
                username=payload.username,
                attribute="Framed-IP-Address",
                op=":=",
                value=payload.framed_ip,
            )
        )
    for g in payload.groups:
        db.add(models.RadUserGroup(username=payload.username, groupname=g, priority=1))
    db.commit()
    return get_user(payload.username, db)


@router.patch("/{username}", response_model=schemas.UserDetail)
def update_user(
    username: str, payload: schemas.UserUpdate, db: Session = Depends(get_db)
) -> schemas.UserDetail:
    existing_pwd = db.execute(
        select(models.RadCheck).where(
            models.RadCheck.username == username,
            models.RadCheck.attribute == "Cleartext-Password",
        ).limit(1)
    ).scalar_one_or_none()
    if not existing_pwd and payload.password is None:
        # check the user actually exists
        any_attr = db.execute(
            select(models.RadCheck).where(models.RadCheck.username == username).limit(1)
        ).scalar_one_or_none()
        if not any_attr:
            raise HTTPException(status_code=404, detail="User not found")

    if payload.password is not None:
        if existing_pwd:
            existing_pwd.value = payload.password
        else:
            db.add(
                models.RadCheck(
                    username=username,
                    attribute="Cleartext-Password",
                    op=":=",
                    value=payload.password,
                )
            )

    if payload.framed_ip is not None:
        existing_ip = db.execute(
            select(models.RadReply).where(
                models.RadReply.username == username,
                models.RadReply.attribute == "Framed-IP-Address",
            ).limit(1)
        ).scalar_one_or_none()
        if payload.framed_ip == "":
            if existing_ip:
                db.delete(existing_ip)
        else:
            if existing_ip:
                existing_ip.value = payload.framed_ip
            else:
                db.add(
                    models.RadReply(
                        username=username,
                        attribute="Framed-IP-Address",
                        op=":=",
                        value=payload.framed_ip,
                    )
                )

    if payload.groups is not None:
        db.execute(
            models.RadUserGroup.__table__.delete().where(models.RadUserGroup.username == username)
        )
        for g in payload.groups:
            db.add(models.RadUserGroup(username=username, groupname=g, priority=1))

    db.commit()
    return get_user(username, db)


@router.delete("/{username}", status_code=204)
def delete_user(username: str, db: Session = Depends(get_db)) -> None:
    found = db.execute(
        select(models.RadCheck).where(models.RadCheck.username == username).limit(1)
    ).scalar_one_or_none()
    if not found:
        raise HTTPException(status_code=404, detail="User not found")
    db.execute(
        models.RadCheck.__table__.delete().where(models.RadCheck.username == username)
    )
    db.execute(
        models.RadReply.__table__.delete().where(models.RadReply.username == username)
    )
    db.execute(
        models.RadUserGroup.__table__.delete().where(models.RadUserGroup.username == username)
    )
    db.commit()


# Free-form attribute management endpoints --------------------------------------------------------
@router.post("/{username}/check", response_model=schemas.CheckAttr, status_code=201)
def add_check_attr(
    username: str, payload: schemas.AttrCreate, db: Session = Depends(get_db)
) -> schemas.CheckAttr:
    row = models.RadCheck(
        username=username,
        attribute=payload.attribute,
        op=payload.op,
        value=payload.value,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.CheckAttr.model_validate(row)


@router.delete("/{username}/check/{attr_id}", status_code=204)
def del_check_attr(username: str, attr_id: int, db: Session = Depends(get_db)) -> None:
    row = db.get(models.RadCheck, attr_id)
    if not row or row.username != username:
        raise HTTPException(status_code=404, detail="Attribute not found")
    db.delete(row)
    db.commit()


@router.post("/{username}/reply", response_model=schemas.ReplyAttr, status_code=201)
def add_reply_attr(
    username: str, payload: schemas.AttrCreate, db: Session = Depends(get_db)
) -> schemas.ReplyAttr:
    row = models.RadReply(
        username=username,
        attribute=payload.attribute,
        op=payload.op,
        value=payload.value,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.ReplyAttr.model_validate(row)


@router.delete("/{username}/reply/{attr_id}", status_code=204)
def del_reply_attr(username: str, attr_id: int, db: Session = Depends(get_db)) -> None:
    row = db.get(models.RadReply, attr_id)
    if not row or row.username != username:
        raise HTTPException(status_code=404, detail="Attribute not found")
    db.delete(row)
    db.commit()
