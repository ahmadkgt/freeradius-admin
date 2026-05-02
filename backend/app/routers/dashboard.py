from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=schemas.DashboardStats)
def stats(db: Session = Depends(get_db)) -> schemas.DashboardStats:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = db.execute(
        select(func.count(distinct(models.RadCheck.username))).where(models.RadCheck.username != "")
    ).scalar_one()
    total_groups = db.execute(
        select(func.count(distinct(models.RadGroupCheck.groupname))).where(
            models.RadGroupCheck.groupname != ""
        )
    ).scalar_one()
    total_nas = db.execute(select(func.count()).select_from(models.Nas)).scalar_one()
    active_sessions = db.execute(
        select(func.count()).where(models.RadAcct.acctstoptime.is_(None))
    ).scalar_one()
    sessions_today = db.execute(
        select(func.count()).where(models.RadAcct.acctstarttime >= today_start)
    ).scalar_one()
    auth_accepts_today = db.execute(
        select(func.count()).where(
            models.RadPostAuth.reply == "Access-Accept",
            models.RadPostAuth.authdate >= today_start,
        )
    ).scalar_one()
    auth_rejects_today = db.execute(
        select(func.count()).where(
            models.RadPostAuth.reply == "Access-Reject",
            models.RadPostAuth.authdate >= today_start,
        )
    ).scalar_one()
    total_input = db.execute(
        select(func.coalesce(func.sum(models.RadAcct.acctinputoctets), 0))
    ).scalar_one()
    total_output = db.execute(
        select(func.coalesce(func.sum(models.RadAcct.acctoutputoctets), 0))
    ).scalar_one()

    # Lifecycle stats — derived from subscriber_profiles + radacct (open sessions).
    now = datetime.utcnow()
    expiring_soon_threshold = now + timedelta(days=3)
    end_of_today = today_start + timedelta(days=1)

    online_usernames = set(
        u
        for u in db.execute(
            select(distinct(models.RadAcct.username)).where(
                models.RadAcct.acctstoptime.is_(None),
                models.RadAcct.username != "",
            )
        )
        .scalars()
        .all()
        if u
    )
    online_users = len(online_usernames)

    all_subs = list(
        db.execute(select(models.SubscriberProfile)).scalars().all()
    )

    def _is_expired(s: models.SubscriberProfile) -> bool:
        return s.expiration_at is not None and s.expiration_at <= now

    disabled_users = sum(1 for s in all_subs if not s.enabled)
    expired_users = sum(
        1
        for s in all_subs
        if s.enabled and _is_expired(s) and s.username not in online_usernames
    )
    expired_online_users = sum(
        1
        for s in all_subs
        if s.enabled and _is_expired(s) and s.username in online_usernames
    )
    expiring_today = sum(
        1
        for s in all_subs
        if s.enabled
        and s.expiration_at is not None
        and now < s.expiration_at <= end_of_today
    )
    expiring_soon = sum(
        1
        for s in all_subs
        if s.enabled
        and s.expiration_at is not None
        and now < s.expiration_at <= expiring_soon_threshold
    )

    # All radcheck users — even those without a subscriber row are treated as enabled+no-expiry.
    all_users = list(
        db.execute(
            select(distinct(models.RadCheck.username)).where(models.RadCheck.username != "")
        )
        .scalars()
        .all()
    )
    sub_by_user = {s.username: s for s in all_subs}
    active_users = 0
    for u in all_users:
        s = sub_by_user.get(u)
        if s is None:
            active_users += 1  # no subscription row → treat as active
        elif s.enabled and not _is_expired(s):
            active_users += 1

    offline_users = max(0, len(all_users) - online_users)

    return schemas.DashboardStats(
        total_users=total_users,
        total_groups=total_groups,
        total_nas=total_nas,
        active_sessions=active_sessions,
        sessions_today=sessions_today,
        auth_accepts_today=auth_accepts_today,
        auth_rejects_today=auth_rejects_today,
        total_input_bytes=int(total_input or 0),
        total_output_bytes=int(total_output or 0),
        active_users=active_users,
        online_users=online_users,
        offline_users=offline_users,
        expired_users=expired_users,
        expired_online_users=expired_online_users,
        expiring_today=expiring_today,
        expiring_soon=expiring_soon,
        disabled_users=disabled_users,
    )


@router.get("/auth-timeseries", response_model=list[schemas.TimeSeriesPoint])
def auth_timeseries(days: int = 7, db: Session = Depends(get_db)) -> list[schemas.TimeSeriesPoint]:
    points: list[schemas.TimeSeriesPoint] = []
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        next_day = day + timedelta(days=1)
        accepts = db.execute(
            select(func.count()).where(
                models.RadPostAuth.reply == "Access-Accept",
                models.RadPostAuth.authdate >= day,
                models.RadPostAuth.authdate < next_day,
            )
        ).scalar_one()
        rejects = db.execute(
            select(func.count()).where(
                models.RadPostAuth.reply == "Access-Reject",
                models.RadPostAuth.authdate >= day,
                models.RadPostAuth.authdate < next_day,
            )
        ).scalar_one()
        points.append(
            schemas.TimeSeriesPoint(
                label=day.strftime("%Y-%m-%d"), accepts=accepts, rejects=rejects
            )
        )
    return points


@router.get("/top-users", response_model=list[schemas.TopUser])
def top_users(limit: int = 5, db: Session = Depends(get_db)) -> list[schemas.TopUser]:
    sessions_count = func.count(models.RadAcct.radacctid)
    total_bytes = func.coalesce(
        func.sum(models.RadAcct.acctinputoctets), 0
    ) + func.coalesce(func.sum(models.RadAcct.acctoutputoctets), 0)
    rows = db.execute(
        select(
            models.RadAcct.username,
            sessions_count.label("sessions"),
            total_bytes.label("total_bytes"),
        )
        .where(models.RadAcct.username != "")
        .group_by(models.RadAcct.username)
        .order_by(total_bytes.desc())
        .limit(limit)
    ).all()
    return [
        schemas.TopUser(
            username=r.username, sessions=int(r.sessions), total_bytes=int(r.total_bytes)
        )
        for r in rows
    ]
