"""Phase 3 — Profit, debt and revenue reports.

All reports are scoped to the current manager's subtree (root sees all).
Permission required: `reports.view`.
"""

from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_manager, require_permission, visible_manager_ids

router = APIRouter(prefix="/reports", tags=["reports"])


def _scoped_manager_ids(
    db: Session, current: models.Manager
) -> set[int] | None:
    """Return None if root (=> no filter), else the set of manager IDs in scope."""
    if current.is_root:
        return None
    return visible_manager_ids(db, current)


@router.get(
    "/profit",
    response_model=schemas.ProfitSummary,
    dependencies=[Depends(require_permission("reports.view"))],
)
def profit_summary(
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.ProfitSummary:
    scope_ids = _scoped_manager_ids(db, current)

    inv_q = select(
        func.coalesce(func.sum(models.Invoice.total_amount), 0),
        func.coalesce(func.sum(models.Invoice.paid_amount), 0),
    ).where(models.Invoice.status != "voided")
    if scope_ids is not None:
        inv_q = inv_q.where(models.Invoice.manager_id.in_(scope_ids))
    invoiced, collected = db.execute(inv_q).one()

    debt_q = select(func.coalesce(func.sum(models.SubscriberProfile.debt), 0))
    if scope_ids is not None:
        debt_q = debt_q.where(models.SubscriberProfile.manager_id.in_(scope_ids))
    outstanding_debt = db.execute(debt_q).scalar_one()

    bal_q = select(func.coalesce(func.sum(models.Manager.balance), 0))
    if scope_ids is not None:
        bal_q = bal_q.where(models.Manager.id.in_(scope_ids))
    manager_balance_total = db.execute(bal_q).scalar_one()

    # Per-manager breakdown — compute aggregates in subqueries first
    # to avoid Cartesian-product inflation when LEFT-joining invoices and
    # subscribers under one GROUP BY.
    inv_agg = (
        select(
            models.Invoice.manager_id.label("mid"),
            func.coalesce(func.sum(models.Invoice.total_amount), 0).label("invoiced"),
            func.coalesce(func.sum(models.Invoice.paid_amount), 0).label("collected"),
        )
        .where(models.Invoice.status != "voided")
        .group_by(models.Invoice.manager_id)
        .subquery()
    )
    sub_agg = (
        select(
            models.SubscriberProfile.manager_id.label("mid"),
            func.count(models.SubscriberProfile.username).label("user_count"),
        )
        .group_by(models.SubscriberProfile.manager_id)
        .subquery()
    )
    by_q = (
        select(
            models.Manager.id,
            models.Manager.username,
            func.coalesce(inv_agg.c.invoiced, 0),
            func.coalesce(inv_agg.c.collected, 0),
            func.coalesce(sub_agg.c.user_count, 0),
        )
        .select_from(models.Manager)
        .join(inv_agg, inv_agg.c.mid == models.Manager.id, isouter=True)
        .join(sub_agg, sub_agg.c.mid == models.Manager.id, isouter=True)
        .order_by(models.Manager.username)
    )
    if scope_ids is not None:
        by_q = by_q.where(models.Manager.id.in_(scope_ids))
    rows = db.execute(by_q).all()

    by_manager = [
        schemas.ProfitByManager(
            manager_id=int(mid),
            manager_username=str(uname),
            invoiced=Decimal(inv_t),
            collected=Decimal(paid_t),
            outstanding=Decimal(inv_t) - Decimal(paid_t),
            user_count=int(uc),
        )
        for mid, uname, inv_t, paid_t, uc in rows
    ]

    return schemas.ProfitSummary(
        total_invoiced=Decimal(invoiced),
        total_collected=Decimal(collected),
        outstanding_subscriber_debt=Decimal(outstanding_debt),
        manager_balance_total=Decimal(manager_balance_total),
        by_manager=by_manager,
    )


@router.get(
    "/revenue",
    response_model=list[schemas.RevenuePoint],
    dependencies=[Depends(require_permission("reports.view"))],
)
def revenue_by_day(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> list[schemas.RevenuePoint]:
    scope_ids = _scoped_manager_ids(db, current)
    cutoff = datetime.utcnow() - timedelta(days=days - 1)

    bucket = func.date(models.Invoice.issue_date)
    q = (
        select(
            bucket.label("bucket"),
            func.coalesce(func.sum(models.Invoice.total_amount), 0).label("invoiced"),
            func.coalesce(func.sum(models.Invoice.paid_amount), 0).label("paid"),
            func.count(models.Invoice.id).label("invoice_count"),
        )
        .where(models.Invoice.issue_date >= cutoff)
        .where(models.Invoice.status != "voided")
        .group_by(bucket)
        .order_by(bucket)
    )
    if scope_ids is not None:
        q = q.where(models.Invoice.manager_id.in_(scope_ids))
    rows = db.execute(q).all()

    by_day = {
        str(b): (Decimal(inv_t), Decimal(paid_t), int(c))
        for b, inv_t, paid_t, c in rows
    }
    out: list[schemas.RevenuePoint] = []
    for i in range(days):
        d = (cutoff + timedelta(days=i)).date().isoformat()
        inv_t, paid_t, c = by_day.get(d, (Decimal("0"), Decimal("0"), 0))
        out.append(
            schemas.RevenuePoint(
                bucket=d,
                invoiced_total=inv_t,
                paid_total=paid_t,
                invoice_count=c,
            )
        )
    return out


@router.get(
    "/debt",
    response_model=schemas.DebtSummary,
    dependencies=[Depends(require_permission("reports.view"))],
)
def debt_summary(
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> schemas.DebtSummary:
    scope_ids = _scoped_manager_ids(db, current)

    sub_q = select(
        models.SubscriberProfile.username,
        models.SubscriberProfile.debt,
        models.SubscriberProfile.first_name,
        models.SubscriberProfile.last_name,
        models.SubscriberProfile.manager_id,
    ).where(models.SubscriberProfile.debt > 0)
    if scope_ids is not None:
        sub_q = sub_q.where(models.SubscriberProfile.manager_id.in_(scope_ids))
    sub_rows = db.execute(sub_q.order_by(models.SubscriberProfile.debt.desc())).all()

    manager_username_map: dict[int, str] = {}
    if sub_rows:
        mids = {r[4] for r in sub_rows if r[4] is not None}
        if mids:
            mgr_rows = db.execute(
                select(models.Manager.id, models.Manager.username).where(
                    models.Manager.id.in_(mids)
                )
            ).all()
            manager_username_map = {mid: uname for mid, uname in mgr_rows}

    rows: list[schemas.DebtorRow] = []
    for username, debt, first, last, mid in sub_rows:
        label_parts = [p for p in (first, last) if p]
        label = " ".join(label_parts) if label_parts else username
        rows.append(
            schemas.DebtorRow(
                type="subscriber",
                id=username,
                label=label,
                debt=Decimal(debt),
                manager_username=manager_username_map.get(mid) if mid else None,
            )
        )

    total_debt_q = select(
        func.coalesce(func.sum(models.SubscriberProfile.debt), 0),
        func.count(models.SubscriberProfile.username),
    ).where(models.SubscriberProfile.debt > 0)
    if scope_ids is not None:
        total_debt_q = total_debt_q.where(
            models.SubscriberProfile.manager_id.in_(scope_ids)
        )
    total_debt, total_count = db.execute(total_debt_q).one()

    unpaid_q = select(
        func.coalesce(
            func.sum(
                case(
                    (
                        models.Invoice.total_amount > models.Invoice.paid_amount,
                        models.Invoice.total_amount - models.Invoice.paid_amount,
                    ),
                    else_=0,
                )
            ),
            0,
        )
    ).where(models.Invoice.status.in_(("pending", "partially_paid")))
    if scope_ids is not None:
        unpaid_q = unpaid_q.where(models.Invoice.manager_id.in_(scope_ids))
    unpaid_amount = db.execute(unpaid_q).scalar_one()

    return schemas.DebtSummary(
        total_subscriber_debt=Decimal(total_debt),
        total_subscriber_count=int(total_count),
        total_unpaid_invoice_amount=Decimal(unpaid_amount),
        rows=rows,
    )
