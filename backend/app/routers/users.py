from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/users", tags=["users"])

EXPIRING_SOON_DAYS = 3


def _now_utc() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _status_for(
    enabled: bool,
    expiration_at: datetime | None,
    online: bool,
) -> schemas.UserStatus:
    """Derive a user's lifecycle status from subscription state + connection state."""
    if not enabled:
        return "disabled"
    now = _now_utc()
    expired = expiration_at is not None and expiration_at <= now
    if expired and online:
        return "expired_online"
    if expired:
        return "expired"
    if online:
        return "active_online"
    if expiration_at is not None and expiration_at <= now + timedelta(days=EXPIRING_SOON_DAYS):
        return "expiring_soon"
    return "active_offline"


def _open_session_usernames(db: Session, usernames: list[str] | None = None) -> set[str]:
    """Return the set of usernames that currently have an open RADIUS session."""
    q = select(models.RadAcct.username).where(models.RadAcct.acctstoptime.is_(None))
    if usernames is not None:
        if not usernames:
            return set()
        q = q.where(models.RadAcct.username.in_(usernames))
    return {row for row in db.execute(q).scalars().all() if row}


def _subscriber_map(db: Session, usernames: list[str]) -> dict[str, models.SubscriberProfile]:
    if not usernames:
        return {}
    rows = list(
        db.execute(
            select(models.SubscriberProfile).where(
                models.SubscriberProfile.username.in_(usernames)
            )
        )
        .scalars()
        .all()
    )
    return {r.username: r for r in rows}


def _profile_name_map(db: Session, profile_ids: list[int]) -> dict[int, str]:
    if not profile_ids:
        return {}
    rows = db.execute(
        select(models.Profile.id, models.Profile.name).where(models.Profile.id.in_(profile_ids))
    ).all()
    return {pid: name for pid, name in rows}


@router.get("", response_model=schemas.Paginated[schemas.UserSummary])
def list_users(
    q: str | None = None,
    status: schemas.UserStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> schemas.Paginated[schemas.UserSummary]:
    base_q = select(distinct(models.RadCheck.username)).where(models.RadCheck.username != "")
    if q:
        like = f"%{q}%"
        # Allow searching by username, first/last name, phone via the subscriber join.
        sub_match = select(models.SubscriberProfile.username).where(
            or_(
                models.SubscriberProfile.first_name.like(like),
                models.SubscriberProfile.last_name.like(like),
                models.SubscriberProfile.phone.like(like),
                models.SubscriberProfile.email.like(like),
            )
        )
        base_q = base_q.where(
            or_(
                models.RadCheck.username.like(like),
                models.RadCheck.username.in_(sub_match),
            )
        )
    base_q = base_q.order_by(models.RadCheck.username)

    # Materialize all matching usernames up-front so we can apply status filtering
    # without paying for a full join in MySQL.
    all_usernames = list(db.execute(base_q).scalars().all())
    online_set = _open_session_usernames(db, all_usernames)
    sub_map = _subscriber_map(db, all_usernames)
    profile_names = _profile_name_map(
        db, [s.profile_id for s in sub_map.values() if s.profile_id is not None]
    )

    # Filter by status if requested.
    filtered: list[str] = []
    for username in all_usernames:
        sub = sub_map.get(username)
        st = _status_for(
            enabled=bool(sub.enabled) if sub else True,
            expiration_at=sub.expiration_at if sub else None,
            online=username in online_set,
        )
        if status is None or st == status:
            filtered.append(username)

    total = len(filtered)
    page_slice = filtered[(page - 1) * page_size : (page - 1) * page_size + page_size]

    items: list[schemas.UserSummary] = []
    for username in page_slice:
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

        sub = sub_map.get(username)
        online = username in online_set
        st = _status_for(
            enabled=bool(sub.enabled) if sub else True,
            expiration_at=sub.expiration_at if sub else None,
            online=online,
        )
        items.append(
            schemas.UserSummary(
                username=username,
                password=password_row,
                groups=groups,
                framed_ip=framed_ip,
                status=st,
                profile_name=profile_names.get(sub.profile_id) if sub and sub.profile_id else None,
                expiration_at=sub.expiration_at if sub else None,
                online=online,
                first_name=sub.first_name if sub else None,
                last_name=sub.last_name if sub else None,
                phone=sub.phone if sub else None,
                balance=sub.balance if sub else Decimal("0"),
            )
        )

    return schemas.Paginated[schemas.UserSummary](
        items=items, total=total, page=page, page_size=page_size
    )


@router.get("/online", response_model=list[schemas.OnlineUser])
def list_online_users(db: Session = Depends(get_db)) -> list[schemas.OnlineUser]:
    """Currently-connected RADIUS users (open `radacct` rows)."""
    rows = list(
        db.execute(
            select(models.RadAcct).where(models.RadAcct.acctstoptime.is_(None)).order_by(
                models.RadAcct.acctstarttime.desc()
            )
        )
        .scalars()
        .all()
    )
    usernames = [r.username for r in rows if r.username]
    sub_map = _subscriber_map(db, usernames)
    profile_names = _profile_name_map(
        db, [s.profile_id for s in sub_map.values() if s.profile_id is not None]
    )
    out: list[schemas.OnlineUser] = []
    for r in rows:
        sub = sub_map.get(r.username)
        out.append(
            schemas.OnlineUser(
                username=r.username,
                nasipaddress=r.nasipaddress,
                framedipaddress=r.framedipaddress or None,
                callingstationid=r.callingstationid or None,
                acctstarttime=r.acctstarttime,
                acctsessiontime=r.acctsessiontime,
                acctinputoctets=r.acctinputoctets,
                acctoutputoctets=r.acctoutputoctets,
                profile_name=profile_names.get(sub.profile_id) if sub and sub.profile_id else None,
            )
        )
    return out


def _hydrate_user_detail(username: str, db: Session) -> schemas.UserDetail:
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
    sub = db.get(models.SubscriberProfile, username)
    profile_name: str | None = None
    if sub and sub.profile_id:
        profile_name = db.execute(
            select(models.Profile.name).where(models.Profile.id == sub.profile_id)
        ).scalar_one_or_none()
    online = username in _open_session_usernames(db, [username])
    status = _status_for(
        enabled=bool(sub.enabled) if sub else True,
        expiration_at=sub.expiration_at if sub else None,
        online=online,
    )
    subscription: schemas.SubscriptionInfo | None = None
    if sub is not None:
        subscription = schemas.SubscriptionInfo(
            profile_id=sub.profile_id,
            profile_name=profile_name,
            enabled=bool(sub.enabled),
            expiration_at=sub.expiration_at,
            balance=sub.balance,
            debt=sub.debt,
            first_name=sub.first_name,
            last_name=sub.last_name,
            email=sub.email,
            phone=sub.phone,
            address=sub.address,
            notes=sub.notes,
        )
    return schemas.UserDetail(
        username=username,
        password=password,
        groups=groups,
        check_attrs=[schemas.CheckAttr.model_validate(c) for c in check_attrs],
        reply_attrs=[schemas.ReplyAttr.model_validate(r) for r in reply_attrs],
        subscription=subscription,
        status=status,
        online=online,
    )


@router.get("/{username}", response_model=schemas.UserDetail)
def get_user(username: str, db: Session = Depends(get_db)) -> schemas.UserDetail:
    return _hydrate_user_detail(username, db)


def _apply_subscription_fields(
    username: str,
    payload: schemas.UserCreate | schemas.UserUpdate | schemas.SubscriptionUpdate,
    db: Session,
) -> None:
    """Upsert subscription metadata for a user from a partial payload."""
    fields_set = payload.model_dump(exclude_unset=True)
    sub_keys = {
        "profile_id", "enabled", "expiration_at", "balance", "debt",
        "first_name", "last_name", "email", "phone", "address", "notes",
    }
    sub_fields = {k: v for k, v in fields_set.items() if k in sub_keys}
    if not sub_fields:
        return
    if sub_fields.get("profile_id") is not None:
        exists = db.execute(
            select(models.Profile.id).where(models.Profile.id == sub_fields["profile_id"])
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(status_code=400, detail="Unknown profile_id")
    sub = db.get(models.SubscriberProfile, username)
    if sub is None:
        sub = models.SubscriberProfile(username=username, **sub_fields)
        db.add(sub)
    else:
        for k, v in sub_fields.items():
            setattr(sub, k, v)


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
    _apply_subscription_fields(payload.username, payload, db)
    db.commit()
    return _hydrate_user_detail(payload.username, db)


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
    if not existing_pwd:
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

    _apply_subscription_fields(username, payload, db)
    db.commit()
    return _hydrate_user_detail(username, db)


@router.patch("/{username}/subscription", response_model=schemas.UserDetail)
def update_subscription(
    username: str, payload: schemas.SubscriptionUpdate, db: Session = Depends(get_db)
) -> schemas.UserDetail:
    """Update only the subscription/contact metadata. The user must already exist in radcheck."""
    any_attr = db.execute(
        select(models.RadCheck).where(models.RadCheck.username == username).limit(1)
    ).scalar_one_or_none()
    if not any_attr:
        raise HTTPException(status_code=404, detail="User not found")
    _apply_subscription_fields(username, payload, db)
    db.commit()
    return _hydrate_user_detail(username, db)


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
    sub = db.get(models.SubscriberProfile, username)
    if sub is not None:
        db.delete(sub)
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
