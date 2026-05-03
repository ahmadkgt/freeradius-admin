"""Phase 4 — background scheduler for automated WhatsApp notifications.

Runs inside the backend process (single-replica) using APScheduler. Two
recurring jobs:

  - ``hourly``: walk every active ``renewal_reminder`` template,
    compute the target date as ``today + config.days_before``, find every
    in-scope subscriber whose ``expiration_at`` falls on that date and
    hasn't received the same template in the last 24h, render + send.

  - ``daily``: send one ``debt_warning`` per subscriber whose
    ``debt`` >= ``config.min_debt`` (default 1) and who hasn't been
    warned in the last 24h.

`invoice_issued` and ``welcome`` are *not* on the scheduler — those are
triggered inline from the invoicing / user-creation flows.

The scheduler is intentionally simple — it doesn't try to back-fill
missed days or coalesce templates. If you want sophisticated cohort
handling, do it from the bulk-send UI for now.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal
from . import render
from .whatsapp import WhatsAppGateway, get_gateway, normalize_phone

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _profile_names(db: Session, profile_ids: list[int]) -> dict[int, str]:
    if not profile_ids:
        return {}
    rows = db.execute(
        select(models.Profile.id, models.Profile.name).where(models.Profile.id.in_(profile_ids))
    ).all()
    return {pid: name for pid, name in rows}


def _already_sent_within(
    db: Session,
    *,
    template_id: int,
    username: str,
    hours: int,
) -> bool:
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    existing = db.execute(
        select(models.Notification.id)
        .where(models.Notification.template_id == template_id)
        .where(models.Notification.subscriber_username == username)
        .where(models.Notification.created_at >= cutoff)
        .limit(1)
    ).scalar_one_or_none()
    return existing is not None


def _send_one(
    db: Session,
    *,
    sub: models.SubscriberProfile,
    template: models.NotificationTemplate,
    body: str,
    gateway: WhatsAppGateway,
) -> None:
    phone = normalize_phone(sub.phone)
    note = models.Notification(
        subscriber_username=sub.username,
        manager_id=sub.manager_id or 1,
        template_id=template.id,
        channel="whatsapp",
        event=template.event,
        phone=phone,
        body=body,
        status="pending",
    )
    db.add(note)
    db.flush()
    if not phone:
        note.status = "failed"
        note.error = "subscriber has no phone number"
        return
    if not body:
        note.status = "failed"
        note.error = "rendered message body is empty"
        return
    ok, message_id, err = gateway.send(phone, body)
    if ok:
        note.status = "sent"
        note.provider_message_id = message_id
        note.sent_at = datetime.utcnow()
    else:
        note.status = "failed"
        note.error = err or "unknown error"


def _process_renewal_reminders(db: Session, gateway: WhatsAppGateway) -> int:
    templates = list(
        db.execute(
            select(models.NotificationTemplate)
            .where(models.NotificationTemplate.event == "renewal_reminder")
            .where(models.NotificationTemplate.enabled == True)  # noqa: E712
        ).scalars()
    )
    if not templates:
        return 0

    sent = 0
    today = date.today()
    for tpl in templates:
        days_before = 3
        if isinstance(tpl.config, dict):
            try:
                days_before = int(tpl.config.get("days_before", 3))
            except (TypeError, ValueError):
                days_before = 3
        target_day = today + timedelta(days=days_before)
        target_start = datetime.combine(target_day, datetime.min.time())
        target_end = datetime.combine(target_day, datetime.max.time())

        subs: Iterable[models.SubscriberProfile] = db.execute(
            select(models.SubscriberProfile)
            .where(models.SubscriberProfile.expiration_at >= target_start)
            .where(models.SubscriberProfile.expiration_at <= target_end)
        ).scalars()
        sub_list = list(subs)
        if not sub_list:
            continue
        profile_names = _profile_names(db, [s.profile_id for s in sub_list if s.profile_id])
        body_template = (tpl.body_ar or tpl.body_en or "").strip()
        if not body_template:
            continue
        for sub in sub_list:
            if _already_sent_within(db, template_id=tpl.id, username=sub.username, hours=20):
                continue
            variables = {
                "username": sub.username,
                "full_name": sub.full_name or sub.username,
                "phone": sub.phone or "",
                "expiration_at": sub.expiration_at,
                "debt": sub.debt,
                "balance": sub.balance,
                "profile_id": sub.profile_id,
                "profile_name": profile_names.get(sub.profile_id) if sub.profile_id else None,
            }
            body = render.render(body_template, variables)
            _send_one(db, sub=sub, template=tpl, body=body, gateway=gateway)
            sent += 1
    return sent


def _process_debt_warnings(db: Session, gateway: WhatsAppGateway) -> int:
    templates = list(
        db.execute(
            select(models.NotificationTemplate)
            .where(models.NotificationTemplate.event == "debt_warning")
            .where(models.NotificationTemplate.enabled == True)  # noqa: E712
        ).scalars()
    )
    if not templates:
        return 0

    sent = 0
    for tpl in templates:
        min_debt = 1
        if isinstance(tpl.config, dict):
            try:
                min_debt = max(1, int(tpl.config.get("min_debt", 1)))
            except (TypeError, ValueError):
                min_debt = 1
        subs = list(
            db.execute(
                select(models.SubscriberProfile).where(models.SubscriberProfile.debt >= min_debt)
            ).scalars()
        )
        if not subs:
            continue
        profile_names = _profile_names(db, [s.profile_id for s in subs if s.profile_id])
        body_template = (tpl.body_ar or tpl.body_en or "").strip()
        if not body_template:
            continue
        for sub in subs:
            if _already_sent_within(db, template_id=tpl.id, username=sub.username, hours=20):
                continue
            variables = {
                "username": sub.username,
                "full_name": sub.full_name or sub.username,
                "phone": sub.phone or "",
                "expiration_at": sub.expiration_at,
                "debt": sub.debt,
                "balance": sub.balance,
                "profile_id": sub.profile_id,
                "profile_name": profile_names.get(sub.profile_id) if sub.profile_id else None,
            }
            body = render.render(body_template, variables)
            _send_one(db, sub=sub, template=tpl, body=body, gateway=gateway)
            sent += 1
    return sent


def hourly_tick() -> None:
    """Renewal reminders. Logs only at INFO when work was actually done."""
    gateway = get_gateway()
    if not gateway.configured:
        return
    try:
        with SessionLocal() as db:
            sent = _process_renewal_reminders(db, gateway)
            db.commit()
            if sent:
                log.info("renewal_reminder: queued %s notifications", sent)
    except Exception:
        log.exception("renewal reminder job failed")


def daily_tick() -> None:
    """Debt warnings."""
    gateway = get_gateway()
    if not gateway.configured:
        return
    try:
        with SessionLocal() as db:
            sent = _process_debt_warnings(db, gateway)
            db.commit()
            if sent:
                log.info("debt_warning: queued %s notifications", sent)
    except Exception:
        log.exception("debt warning job failed")


def start() -> BackgroundScheduler:
    """Start the scheduler. Idempotent — calling twice returns the same instance."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    sched = BackgroundScheduler(timezone="UTC")
    sched.add_job(
        hourly_tick,
        "cron",
        minute=5,
        id="renewal_reminders",
        replace_existing=True,
        misfire_grace_time=600,
    )
    sched.add_job(
        daily_tick,
        "cron",
        hour=9,
        minute=10,
        id="debt_warnings",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    sched.start()
    _scheduler = sched
    log.info("notification scheduler started (renewal reminders @ :05, debt warnings @ 09:10 UTC)")
    return sched


def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
