"""Phase 4 — WhatsApp gateway control + notification templates / log."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import (
    get_current_manager,
    require_permission,
    visible_manager_ids,
)
from ..services import render
from ..services.whatsapp import WhatsAppGateway, get_gateway, normalize_phone

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ---- helpers ------------------------------------------------------------


def _scope_filter(current: models.Manager, db: Session):
    """Filter clause limiting notifications to the current manager's subtree."""
    if current.is_root:
        return None
    ids = visible_manager_ids(db, current)
    return models.Notification.manager_id.in_(ids)


def _subscriber_in_scope(
    db: Session, current: models.Manager, username: str
) -> models.SubscriberProfile | None:
    """Return the subscriber row only if it's in the manager's subtree."""
    sub = db.execute(
        select(models.SubscriberProfile).where(
            models.SubscriberProfile.username == username
        )
    ).scalar_one_or_none()
    if sub is None:
        return None
    if current.is_root:
        return sub
    if sub.manager_id in visible_manager_ids(db, current):
        return sub
    return None


def _build_variables(
    sub: models.SubscriberProfile | None,
    profile_name: str | None = None,
    invoice: models.Invoice | None = None,
    manager_username: str | None = None,
) -> dict[str, object]:
    """Render-context for `{{placeholders}}`. Anything missing becomes empty."""
    out: dict[str, object] = {}
    if sub is not None:
        out["username"] = sub.username
        out["full_name"] = sub.full_name or sub.username
        out["phone"] = sub.phone or ""
        out["expiration_at"] = sub.expiration_at
        out["debt"] = sub.debt
        out["balance"] = sub.balance
        out["profile_id"] = sub.profile_id
    if profile_name:
        out["profile_name"] = profile_name
    if invoice is not None:
        out["invoice_number"] = invoice.invoice_number
        out["amount"] = invoice.total_amount
    if manager_username:
        out["manager_username"] = manager_username
    return out


def _profile_name_for(db: Session, profile_id: int | None) -> str | None:
    if not profile_id:
        return None
    return db.execute(
        select(models.Profile.name).where(models.Profile.id == profile_id)
    ).scalar_one_or_none()


def _select_body(template: models.NotificationTemplate, locale: str) -> str:
    """Pick AR or EN body, falling back to the other if the requested one is empty."""
    primary = template.body_ar if locale == "ar" else template.body_en
    fallback = template.body_en if locale == "ar" else template.body_ar
    return (primary or fallback or "").strip()


def _record_send(
    db: Session,
    *,
    current: models.Manager,
    sub: models.SubscriberProfile | None,
    template: models.NotificationTemplate | None,
    body: str,
    phone: str | None,
    event: str,
    gateway: WhatsAppGateway,
) -> models.Notification:
    """Persist + send (best effort) a single notification row."""
    note = models.Notification(
        subscriber_username=sub.username if sub is not None else None,
        manager_id=(sub.manager_id if sub is not None else current.id) or current.id,
        template_id=template.id if template is not None else None,
        channel="whatsapp",
        event=event,
        phone=phone,
        body=body,
        status="pending",
    )
    db.add(note)
    db.flush()  # need the id

    if not phone:
        note.status = "failed"
        note.error = "subscriber has no phone number"
        return note
    if not body:
        note.status = "failed"
        note.error = "rendered message body is empty"
        return note

    ok, message_id, err = gateway.send(phone, body)
    if ok:
        note.status = "sent"
        note.provider_message_id = message_id
        note.sent_at = datetime.utcnow()
        note.error = None
    else:
        note.status = "failed"
        note.error = err or "unknown error"
    return note


# ---- whatsapp gateway ---------------------------------------------------


@router.get(
    "/whatsapp/status",
    response_model=schemas.WhatsAppStatus,
    dependencies=[Depends(require_permission("notifications.whatsapp.manage"))],
)
def whatsapp_status(
    db: Session = Depends(get_db),
    gateway: WhatsAppGateway = Depends(get_gateway),
) -> schemas.WhatsAppStatus:
    status = gateway.status()
    # Mirror the snapshot into the DB so admins can spot prolonged outages.
    sess = db.execute(
        select(models.WhatsAppSession).where(models.WhatsAppSession.label == "default")
    ).scalar_one_or_none()
    if sess is None:
        sess = models.WhatsAppSession(label="default")
        db.add(sess)
    sess.connected = status.connected
    sess.jid = status.jid
    sess.last_error = status.last_error
    sess.last_status_at = datetime.utcnow()
    db.flush()
    db.commit()
    return schemas.WhatsAppStatus(
        connected=status.connected,
        jid=status.jid,
        has_qr=status.has_qr,
        last_error=status.last_error,
        last_status_at=sess.last_status_at,
    )


@router.get(
    "/whatsapp/qr.png",
    dependencies=[Depends(require_permission("notifications.whatsapp.manage"))],
)
def whatsapp_qr(gateway: WhatsAppGateway = Depends(get_gateway)) -> Response:
    png = gateway.qr_png()
    if png is None:
        raise HTTPException(
            status_code=404,
            detail="No QR available — already paired or gateway unreachable",
        )
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post(
    "/whatsapp/disconnect",
    dependencies=[Depends(require_permission("notifications.whatsapp.manage"))],
    status_code=204,
)
def whatsapp_disconnect(
    gateway: WhatsAppGateway = Depends(get_gateway),
    db: Session = Depends(get_db),
) -> Response:
    if not gateway.disconnect():
        raise HTTPException(status_code=502, detail="WhatsApp gateway unreachable")
    sess = db.execute(
        select(models.WhatsAppSession).where(models.WhatsAppSession.label == "default")
    ).scalar_one_or_none()
    if sess is not None:
        sess.connected = False
        sess.jid = None
        sess.last_status_at = datetime.utcnow()
    db.commit()
    return Response(status_code=204)


# ---- templates ----------------------------------------------------------


@router.get(
    "/templates",
    response_model=list[schemas.NotificationTemplateOut],
    dependencies=[Depends(require_permission("notifications.view"))],
)
def list_templates(db: Session = Depends(get_db)) -> list[models.NotificationTemplate]:
    return list(
        db.execute(
            select(models.NotificationTemplate).order_by(models.NotificationTemplate.id.asc())
        ).scalars()
    )


@router.get(
    "/templates/variables",
    dependencies=[Depends(require_permission("notifications.view"))],
)
def list_template_variables() -> dict[str, list[str]]:
    return {"variables": render.known_variables()}


@router.post(
    "/templates",
    response_model=schemas.NotificationTemplateOut,
    status_code=201,
    dependencies=[Depends(require_permission("notifications.templates.manage"))],
)
def create_template(
    payload: schemas.NotificationTemplateCreate,
    db: Session = Depends(get_db),
) -> models.NotificationTemplate:
    if not (payload.body_ar or payload.body_en):
        raise HTTPException(status_code=400, detail="At least one of body_ar / body_en is required")
    tpl = models.NotificationTemplate(
        name=payload.name,
        event=payload.event,
        enabled=payload.enabled,
        body_ar=payload.body_ar,
        body_en=payload.body_en,
        config=payload.config,
    )
    db.add(tpl)
    db.flush()
    db.commit()
    db.refresh(tpl)
    return tpl


@router.patch(
    "/templates/{template_id}",
    response_model=schemas.NotificationTemplateOut,
    dependencies=[Depends(require_permission("notifications.templates.manage"))],
)
def update_template(
    template_id: int,
    payload: schemas.NotificationTemplateUpdate,
    db: Session = Depends(get_db),
) -> models.NotificationTemplate:
    tpl = db.get(models.NotificationTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(tpl, k, v)
    if not (tpl.body_ar or tpl.body_en):
        raise HTTPException(status_code=400, detail="At least one of body_ar / body_en is required")
    db.flush()
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete(
    "/templates/{template_id}",
    status_code=204,
    dependencies=[Depends(require_permission("notifications.templates.manage"))],
)
def delete_template(template_id: int, db: Session = Depends(get_db)) -> Response:
    tpl = db.get(models.NotificationTemplate, template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
    return Response(status_code=204)


# ---- send ---------------------------------------------------------------


@router.post(
    "/send",
    response_model=schemas.NotificationOut,
    dependencies=[Depends(require_permission("notifications.send"))],
)
def send_one(
    payload: schemas.NotificationSendRequest,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
    gateway: WhatsAppGateway = Depends(get_gateway),
) -> models.Notification:
    sub = _subscriber_in_scope(db, current, payload.subscriber_username)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    template: models.NotificationTemplate | None = None
    body: str
    event = "custom"
    if payload.template_id is not None:
        template = db.get(models.NotificationTemplate, payload.template_id)
        if template is None:
            raise HTTPException(status_code=404, detail="Template not found")
        if not template.enabled:
            raise HTTPException(status_code=400, detail="Template is disabled")
        raw = _select_body(template, payload.locale)
        if not raw:
            raise HTTPException(
                status_code=400,
                detail="Template has no body for the requested locale",
            )
        profile_name = _profile_name_for(db, sub.profile_id)
        variables = _build_variables(
            sub, profile_name=profile_name, manager_username=current.username
        )
        body = render.render(raw, variables)
        event = template.event
    else:
        if not payload.body or not payload.body.strip():
            raise HTTPException(
                status_code=400,
                detail="`body` is required when `template_id` is not set",
            )
        body = payload.body.strip()

    note = _record_send(
        db,
        current=current,
        sub=sub,
        template=template,
        body=body,
        phone=normalize_phone(sub.phone),
        event=event,
        gateway=gateway,
    )
    db.commit()
    db.refresh(note)
    return note


@router.post(
    "/send-bulk",
    response_model=schemas.NotificationSendResponse,
    dependencies=[Depends(require_permission("notifications.send"))],
)
def send_bulk(
    payload: schemas.NotificationBulkSendRequest,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
    gateway: WhatsAppGateway = Depends(get_gateway),
) -> schemas.NotificationSendResponse:
    template = db.get(models.NotificationTemplate, payload.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if not template.enabled:
        raise HTTPException(status_code=400, detail="Template is disabled")
    raw = _select_body(template, payload.locale)
    if not raw:
        raise HTTPException(status_code=400, detail="Template has no body for the requested locale")

    visible = visible_manager_ids(db, current)

    stmt = select(models.SubscriberProfile).where(
        models.SubscriberProfile.manager_id.in_(visible)
    )
    if payload.usernames:
        stmt = stmt.where(models.SubscriberProfile.username.in_(payload.usernames))

    subs = list(db.execute(stmt).scalars())

    # `filter_status` is a derived value (computed from enabled / expiration_at /
    # online state in users.py:_status_for). Apply it in Python after the fetch
    # rather than against a non-existent SubscriberProfile.status column.
    if payload.filter_status:
        from .users import _open_session_usernames, _status_for  # local import avoids cycle

        usernames = [s.username for s in subs]
        online_set = _open_session_usernames(db, usernames)
        subs = [
            s for s in subs
            if _status_for(s.enabled, s.expiration_at, s.username in online_set)
            == payload.filter_status
        ]
    sent = failed = 0
    rendered_notes: list[models.Notification] = []
    profile_names: dict[int, str] = {}
    for sub in subs:
        if sub.profile_id and sub.profile_id not in profile_names:
            name = _profile_name_for(db, sub.profile_id)
            if name:
                profile_names[sub.profile_id] = name
        variables = _build_variables(
            sub,
            profile_name=profile_names.get(sub.profile_id) if sub.profile_id else None,
            manager_username=current.username,
        )
        body = render.render(raw, variables)
        note = _record_send(
            db,
            current=current,
            sub=sub,
            template=template,
            body=body,
            phone=normalize_phone(sub.phone),
            event=template.event,
            gateway=gateway,
        )
        rendered_notes.append(note)
        if note.status == "sent":
            sent += 1
        else:
            failed += 1

    db.commit()
    for n in rendered_notes:
        db.refresh(n)
    return schemas.NotificationSendResponse(
        queued=len(subs),
        sent=sent,
        failed=failed,
        notifications=[schemas.NotificationOut.model_validate(n) for n in rendered_notes],
    )


# ---- log ----------------------------------------------------------------


@router.get(
    "",
    response_model=schemas.Paginated[schemas.NotificationOut],
    dependencies=[Depends(require_permission("notifications.view"))],
)
def list_notifications(
    q: str | None = None,
    status: str | None = Query(None, pattern="^(pending|sent|failed)$"),
    subscriber_username: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.Paginated[schemas.NotificationOut]:
    base = select(models.Notification)
    scope = _scope_filter(current, db)
    if scope is not None:
        base = base.where(scope)
    if status:
        base = base.where(models.Notification.status == status)
    if subscriber_username:
        base = base.where(models.Notification.subscriber_username == subscriber_username)
    if q:
        like = f"%{q}%"
        base = base.where(
            or_(
                models.Notification.body.like(like),
                models.Notification.phone.like(like),
                models.Notification.subscriber_username.like(like),
            )
        )

    total = db.execute(select(func.count()).select_from(base.subquery())).scalar() or 0

    rows: Iterable[models.Notification] = db.execute(
        base.order_by(desc(models.Notification.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars()
    items = [schemas.NotificationOut.model_validate(r) for r in rows]
    return schemas.Paginated[schemas.NotificationOut](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/{notification_id}/retry",
    response_model=schemas.NotificationOut,
    dependencies=[Depends(require_permission("notifications.send"))],
)
def retry_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
    gateway: WhatsAppGateway = Depends(get_gateway),
) -> models.Notification:
    note = db.get(models.Notification, notification_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not current.is_root and note.manager_id not in visible_manager_ids(db, current):
        raise HTTPException(status_code=404, detail="Notification not found")
    if note.status == "sent":
        raise HTTPException(status_code=400, detail="Notification was already delivered")
    if not note.phone:
        raise HTTPException(status_code=400, detail="Notification has no phone number")

    ok, message_id, err = gateway.send(note.phone, note.body)
    if ok:
        note.status = "sent"
        note.provider_message_id = message_id
        note.sent_at = datetime.utcnow()
        note.error = None
    else:
        note.status = "failed"
        note.error = err or "unknown error"
    db.flush()
    db.commit()
    db.refresh(note)
    return note
