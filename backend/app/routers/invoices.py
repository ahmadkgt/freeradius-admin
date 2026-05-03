"""Phase 3 — Invoice CRUD + payment recording.

Scoping rules:
- Root sees and writes all invoices.
- Sub-managers see invoices whose `manager_id` is in their subtree
  (`visible_manager_ids`). Out-of-scope reads are masked as 404.
- Creating an invoice requires the subscriber to be in scope.
- Recording a payment requires the invoice to be in scope.
"""

from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, or_, select, text
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_manager, require_permission, visible_manager_ids

router = APIRouter(prefix="/invoices", tags=["invoices"])

# --- helpers -------------------------------------------------------


def _manager_username_map(
    db: Session, manager_ids: list[int]
) -> dict[int, str]:
    if not manager_ids:
        return {}
    ids = {mid for mid in manager_ids if mid is not None}
    if not ids:
        return {}
    rows = db.execute(
        select(models.Manager.id, models.Manager.username).where(
            models.Manager.id.in_(ids)
        )
    ).all()
    return {mid: uname for mid, uname in rows}


def _profile_name_map(db: Session, profile_ids: list[int]) -> dict[int, str]:
    if not profile_ids:
        return {}
    ids = {pid for pid in profile_ids if pid is not None}
    if not ids:
        return {}
    rows = db.execute(
        select(models.Profile.id, models.Profile.name).where(
            models.Profile.id.in_(ids)
        )
    ).all()
    return {pid: name for pid, name in rows}


def _generate_invoice_number(db: Session) -> str:
    """Return a sequential invoice number like INV-YYYY-000123.

    Atomically allocates the next sequence number for the current year via
    the `invoice_sequences` counter table:

        INSERT INTO invoice_sequences (year, last_seq) VALUES (:y, 1)
        ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1);

    `last_seq` stores the most recently allocated number. On the INSERT
    path (no row for the year yet) we claim seq=1 and seed the row with
    last_seq=1. On the UPDATE path, `LAST_INSERT_ID(expr)` lets us pull the
    incremented value back without a second SELECT. Two concurrent callers
    serialize on the row's X-lock, so each one gets a distinct seq — no
    UNIQUE constraint races on `invoice_number`.
    """
    year = datetime.utcnow().year
    db.execute(
        text(
            "INSERT INTO invoice_sequences (year, last_seq) VALUES (:y, 1) "
            "ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)"
        ),
        {"y": year},
    )
    seq = db.execute(text("SELECT LAST_INSERT_ID()")).scalar()
    if not seq:
        # INSERT path: the table has no AUTO_INCREMENT key, so
        # LAST_INSERT_ID() returns 0; we just seeded last_seq=1 and that's
        # the number we claim.
        seq = 1
    return f"INV-{year}-{int(seq):06d}"


def _to_out(
    inv: models.Invoice,
    manager_username: str | None,
    issued_by_username: str | None,
    profile_name: str | None,
) -> schemas.InvoiceOut:
    balance_due = (inv.total_amount or Decimal("0")) - (
        inv.paid_amount or Decimal("0")
    )
    return schemas.InvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        subscriber_username=inv.subscriber_username,
        manager_id=inv.manager_id,
        manager_username=manager_username,
        issued_by_manager_id=inv.issued_by_manager_id,
        issued_by_username=issued_by_username,
        profile_id=inv.profile_id,
        profile_name=profile_name,
        description=inv.description,
        amount=inv.amount,
        vat_percent=inv.vat_percent,
        vat_amount=inv.vat_amount,
        total_amount=inv.total_amount,
        paid_amount=inv.paid_amount,
        balance_due=balance_due,
        status=inv.status,
        issue_date=inv.issue_date,
        due_date=inv.due_date,
        period_start=inv.period_start,
        period_end=inv.period_end,
        notes=inv.notes,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


def _payment_to_out(
    p: models.InvoicePayment, recorded_by_username: str | None
) -> schemas.InvoicePaymentOut:
    return schemas.InvoicePaymentOut(
        id=p.id,
        invoice_id=p.invoice_id,
        amount=p.amount,
        method=p.method,
        paid_at=p.paid_at,
        recorded_by_manager_id=p.recorded_by_manager_id,
        recorded_by_username=recorded_by_username,
        reference=p.reference,
        notes=p.notes,
    )


def _ensure_invoice_in_scope(
    db: Session, invoice_id: int, current: models.Manager
) -> models.Invoice:
    inv = db.get(models.Invoice, invoice_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not current.is_root:
        visible = visible_manager_ids(db, current)
        if inv.manager_id not in visible:
            raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


def _recompute_status(inv: models.Invoice) -> None:
    """Update invoice.status based on paid_amount vs total_amount.

    Does NOT touch invoices that were explicitly voided / written-off.
    """
    if inv.status in ("voided", "written_off"):
        return
    paid = inv.paid_amount or Decimal("0")
    total = inv.total_amount or Decimal("0")
    if paid <= Decimal("0"):
        inv.status = "pending"
    elif paid >= total:
        inv.status = "paid"
    else:
        inv.status = "partially_paid"


# --- endpoints -----------------------------------------------------


@router.get(
    "",
    response_model=schemas.Paginated[schemas.InvoiceOut],
    dependencies=[Depends(require_permission("invoices.view"))],
)
def list_invoices(
    q: str | None = None,
    status_filter: schemas.InvoiceStatus | None = Query(None, alias="status"),
    subscriber_username: str | None = None,
    manager_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.Paginated[schemas.InvoiceOut]:
    base = select(models.Invoice)
    if not current.is_root:
        visible = visible_manager_ids(db, current)
        if not visible:
            return schemas.Paginated(items=[], total=0, page=page, page_size=page_size)
        base = base.where(models.Invoice.manager_id.in_(visible))
    if status_filter:
        base = base.where(models.Invoice.status == status_filter)
    if subscriber_username:
        base = base.where(
            models.Invoice.subscriber_username == subscriber_username
        )
    if manager_id is not None:
        base = base.where(models.Invoice.manager_id == manager_id)
    if q:
        like = f"%{q}%"
        base = base.where(
            or_(
                models.Invoice.invoice_number.like(like),
                models.Invoice.subscriber_username.like(like),
                models.Invoice.description.like(like),
            )
        )

    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()

    rows = list(
        db.execute(
            base.order_by(desc(models.Invoice.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    manager_names = _manager_username_map(
        db, [r.manager_id for r in rows] + [r.issued_by_manager_id or 0 for r in rows]
    )
    profile_names = _profile_name_map(db, [r.profile_id or 0 for r in rows])

    items = [
        _to_out(
            r,
            manager_username=manager_names.get(r.manager_id),
            issued_by_username=manager_names.get(r.issued_by_manager_id)
            if r.issued_by_manager_id
            else None,
            profile_name=profile_names.get(r.profile_id) if r.profile_id else None,
        )
        for r in rows
    ]
    return schemas.Paginated(items=items, total=int(total), page=page, page_size=page_size)


@router.get(
    "/{invoice_id}",
    response_model=schemas.InvoiceDetail,
    dependencies=[Depends(require_permission("invoices.view"))],
)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.InvoiceDetail:
    inv = _ensure_invoice_in_scope(db, invoice_id, current)
    payments = list(
        db.execute(
            select(models.InvoicePayment)
            .where(models.InvoicePayment.invoice_id == inv.id)
            .order_by(desc(models.InvoicePayment.paid_at))
        )
        .scalars()
        .all()
    )
    manager_names = _manager_username_map(
        db,
        [inv.manager_id]
        + ([inv.issued_by_manager_id] if inv.issued_by_manager_id else [])
        + [p.recorded_by_manager_id for p in payments if p.recorded_by_manager_id],
    )
    profile_names = _profile_name_map(db, [inv.profile_id] if inv.profile_id else [])
    base = _to_out(
        inv,
        manager_username=manager_names.get(inv.manager_id),
        issued_by_username=manager_names.get(inv.issued_by_manager_id)
        if inv.issued_by_manager_id
        else None,
        profile_name=profile_names.get(inv.profile_id) if inv.profile_id else None,
    )
    return schemas.InvoiceDetail(
        **base.model_dump(),
        payments=[
            _payment_to_out(p, manager_names.get(p.recorded_by_manager_id))
            for p in payments
        ],
    )


def _create_invoice_for_subscriber(
    db: Session,
    *,
    subscriber: models.SubscriberProfile,
    payload: schemas.InvoiceCreate,
    current: models.Manager,
) -> models.Invoice:
    """Build + persist an Invoice for the given subscriber. Caller must commit."""
    profile: models.Profile | None = None
    profile_id = payload.profile_id or subscriber.profile_id
    if profile_id is not None:
        profile = db.get(models.Profile, profile_id)
        if profile is None:
            raise HTTPException(status_code=400, detail="Profile not found")

    if payload.amount is not None:
        base_amount = Decimal(payload.amount)
    elif profile is not None:
        base_amount = profile.unit_price
    else:
        raise HTTPException(
            status_code=400,
            detail="Either amount or profile_id must be provided",
        )

    if payload.vat_percent is not None:
        vat_percent = Decimal(payload.vat_percent)
    elif profile is not None:
        vat_percent = profile.vat_percent
    else:
        vat_percent = Decimal("0")

    vat_amount = (base_amount * vat_percent / Decimal("100")).quantize(Decimal("0.01"))
    total_amount = base_amount + vat_amount

    issue_date = payload.issue_date or datetime.utcnow()
    due_date = payload.due_date

    inv = models.Invoice(
        invoice_number=_generate_invoice_number(db),
        subscriber_username=subscriber.username,
        manager_id=subscriber.manager_id or current.id,
        issued_by_manager_id=current.id,
        profile_id=profile.id if profile else None,
        description=payload.description
        or (f"Subscription: {profile.name}" if profile else None),
        amount=base_amount,
        vat_percent=vat_percent,
        vat_amount=vat_amount,
        total_amount=total_amount,
        paid_amount=Decimal("0"),
        status="pending",
        issue_date=issue_date,
        due_date=due_date,
        period_start=payload.period_start,
        period_end=payload.period_end,
        notes=payload.notes,
    )
    db.add(inv)
    # Subscriber owes the new invoice until paid.
    subscriber.debt = (subscriber.debt or Decimal("0")) + total_amount
    db.flush()
    return inv


@router.post(
    "",
    response_model=schemas.InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("invoices.manage"))],
)
def create_invoice(
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.InvoiceOut:
    sub = db.get(models.SubscriberProfile, payload.subscriber_username)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    # Scope: subscriber's owning manager must be in current's subtree.
    if not current.is_root:
        visible = visible_manager_ids(db, current)
        if sub.manager_id is None or sub.manager_id not in visible:
            raise HTTPException(status_code=404, detail="Subscriber not found")

    inv = _create_invoice_for_subscriber(
        db, subscriber=sub, payload=payload, current=current
    )
    db.commit()
    db.refresh(inv)

    manager_names = _manager_username_map(db, [inv.manager_id, inv.issued_by_manager_id or 0])
    profile_names = _profile_name_map(db, [inv.profile_id] if inv.profile_id else [])
    return _to_out(
        inv,
        manager_username=manager_names.get(inv.manager_id),
        issued_by_username=manager_names.get(inv.issued_by_manager_id)
        if inv.issued_by_manager_id
        else None,
        profile_name=profile_names.get(inv.profile_id) if inv.profile_id else None,
    )


@router.patch(
    "/{invoice_id}",
    response_model=schemas.InvoiceOut,
    dependencies=[Depends(require_permission("invoices.manage"))],
)
def update_invoice(
    invoice_id: int,
    payload: schemas.InvoiceUpdate,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.InvoiceOut:
    inv = _ensure_invoice_in_scope(db, invoice_id, current)
    fields = payload.model_dump(exclude_unset=True)
    new_status = fields.pop("status", None)
    for key, value in fields.items():
        setattr(inv, key, value)

    if new_status is not None:
        if new_status == inv.status:
            pass
        elif new_status in ("voided", "written_off"):
            # Voiding / writing-off cancels the subscriber's outstanding debt
            # for this invoice.
            sub = db.get(models.SubscriberProfile, inv.subscriber_username)
            if sub is not None:
                outstanding = (inv.total_amount or Decimal("0")) - (
                    inv.paid_amount or Decimal("0")
                )
                sub.debt = max(
                    Decimal("0"), (sub.debt or Decimal("0")) - outstanding
                )
            inv.status = new_status
        elif new_status == "pending" and inv.status in ("voided", "written_off"):
            # Reopening: re-add the outstanding balance to subscriber's debt.
            sub = db.get(models.SubscriberProfile, inv.subscriber_username)
            if sub is not None:
                outstanding = (inv.total_amount or Decimal("0")) - (
                    inv.paid_amount or Decimal("0")
                )
                sub.debt = (sub.debt or Decimal("0")) + outstanding
            inv.status = new_status
            _recompute_status(inv)
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Status can only be set to 'voided', 'written_off' or "
                    "back to 'pending' (to reopen)."
                ),
            )

    db.commit()
    db.refresh(inv)

    manager_names = _manager_username_map(db, [inv.manager_id, inv.issued_by_manager_id or 0])
    profile_names = _profile_name_map(db, [inv.profile_id] if inv.profile_id else [])
    return _to_out(
        inv,
        manager_username=manager_names.get(inv.manager_id),
        issued_by_username=manager_names.get(inv.issued_by_manager_id)
        if inv.issued_by_manager_id
        else None,
        profile_name=profile_names.get(inv.profile_id) if inv.profile_id else None,
    )


@router.post(
    "/{invoice_id}/payments",
    response_model=schemas.InvoicePaymentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("invoices.manage"))],
)
def record_payment(
    invoice_id: int,
    payload: schemas.InvoicePaymentCreate,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.InvoicePaymentOut:
    inv = _ensure_invoice_in_scope(db, invoice_id, current)
    if inv.status in ("voided", "written_off"):
        raise HTTPException(
            status_code=400,
            detail="Cannot record a payment on a voided or written-off invoice",
        )

    amount = Decimal(payload.amount)
    if amount <= Decimal("0"):
        raise HTTPException(status_code=400, detail="Payment amount must be > 0")

    outstanding = (inv.total_amount or Decimal("0")) - (inv.paid_amount or Decimal("0"))
    if amount > outstanding:
        raise HTTPException(
            status_code=400,
            detail=f"Payment ({amount}) exceeds outstanding balance ({outstanding}).",
        )

    payment = models.InvoicePayment(
        invoice_id=inv.id,
        amount=amount,
        method=payload.method,
        paid_at=payload.paid_at or datetime.utcnow(),
        recorded_by_manager_id=current.id,
        reference=payload.reference,
        notes=payload.notes,
    )
    db.add(payment)

    inv.paid_amount = (inv.paid_amount or Decimal("0")) + amount
    _recompute_status(inv)

    # Reduce subscriber's outstanding debt.
    sub = db.get(models.SubscriberProfile, inv.subscriber_username)
    if sub is not None:
        sub.debt = max(Decimal("0"), (sub.debt or Decimal("0")) - amount)

    db.flush()
    db.commit()
    db.refresh(payment)

    return _payment_to_out(payment, current.username)


@router.delete(
    "/{invoice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("invoices.manage"))],
)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> None:
    """Hard-delete an invoice. Only allowed if no payments are recorded.

    Recommended path is to PATCH `status='voided'` instead; delete is here
    for clean-up of mistaken entries.
    """
    inv = _ensure_invoice_in_scope(db, invoice_id, current)
    payment_count = db.execute(
        select(func.count()).select_from(
            select(models.InvoicePayment.id)
            .where(models.InvoicePayment.invoice_id == inv.id)
            .subquery()
        )
    ).scalar_one()
    if payment_count:
        raise HTTPException(
            status_code=409,
            detail=(
                "Invoice has payments recorded; void it instead via PATCH "
                "status='voided'."
            ),
        )
    if inv.status not in ("pending", "voided"):
        raise HTTPException(
            status_code=409,
            detail="Only pending or voided invoices can be hard-deleted.",
        )
    sub = db.get(models.SubscriberProfile, inv.subscriber_username)
    if sub is not None and inv.status == "pending":
        outstanding = (inv.total_amount or Decimal("0")) - (
            inv.paid_amount or Decimal("0")
        )
        sub.debt = max(Decimal("0"), (sub.debt or Decimal("0")) - outstanding)
    db.delete(inv)
    db.commit()


# --- Renewal helper exported for users router ----------------------


def renew_subscriber(
    db: Session,
    *,
    subscriber: models.SubscriberProfile,
    payload: schemas.RenewRequest,
    current: models.Manager,
) -> tuple[models.SubscriberProfile, models.Invoice | None]:
    """Push the subscriber's expiration_at forward and (optionally) issue an invoice.

    The caller is responsible for the visibility/scope check on `subscriber`.
    Returns (subscriber, invoice_or_None). Caller commits.
    """
    profile_id = payload.profile_id or subscriber.profile_id
    profile: models.Profile | None = None
    if profile_id is not None:
        profile = db.get(models.Profile, profile_id)
        if profile is None:
            raise HTTPException(status_code=400, detail="Profile not found")

    period_value = payload.period_value or (profile.duration_value if profile else 30)
    period_unit = payload.period_unit or (
        profile.duration_unit if profile else "days"
    )

    # Renew from `max(now, current expiration)` so renewing early stacks correctly.
    base = subscriber.expiration_at or datetime.utcnow()
    if base < datetime.utcnow():
        base = datetime.utcnow()
    if period_unit == "days":
        new_expiration = base + timedelta(days=period_value)
    elif period_unit == "months":
        new_expiration = base + timedelta(days=30 * period_value)
    elif period_unit == "years":
        new_expiration = base + timedelta(days=365 * period_value)
    else:
        raise HTTPException(status_code=400, detail="Invalid period_unit")

    subscriber.expiration_at = new_expiration
    if profile is not None:
        subscriber.profile_id = profile.id

    invoice: models.Invoice | None = None
    if payload.issue_invoice and profile is not None:
        invoice = _create_invoice_for_subscriber(
            db,
            subscriber=subscriber,
            payload=schemas.InvoiceCreate(
                subscriber_username=subscriber.username,
                profile_id=profile.id,
                period_start=base,
                period_end=new_expiration,
                description=f"Renewal: {profile.name}",
                notes=payload.notes,
            ),
            current=current,
        )
    db.flush()
    return subscriber, invoice
