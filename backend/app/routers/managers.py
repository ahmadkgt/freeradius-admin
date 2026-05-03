"""Phase 2 — managers/resellers CRUD with hierarchy and RBAC scoping.

Phase 3 added:
- GET  /managers/{id}/ledger        — read the running balance log
- POST /managers/{id}/credit        — add funds to a child manager
- POST /managers/{id}/debit         — withdraw funds from a child manager
"""

from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from .. import models, permissions, schemas
from ..database import get_db
from ..security import (
    hash_password,
    manager_subtree_ids,
    require_permission,
    visible_manager_ids,
)

router = APIRouter(prefix="/managers", tags=["managers"])


def _user_counts(db: Session, manager_ids: set[int]) -> dict[int, int]:
    if not manager_ids:
        return {}
    rows = db.execute(
        select(
            models.SubscriberProfile.manager_id,
            func.count(models.SubscriberProfile.username),
        )
        .where(models.SubscriberProfile.manager_id.in_(manager_ids))
        .group_by(models.SubscriberProfile.manager_id)
    ).all()
    return {row[0]: row[1] for row in rows if row[0] is not None}


def _sub_counts(db: Session, manager_ids: set[int]) -> dict[int, int]:
    if not manager_ids:
        return {}
    rows = db.execute(
        select(models.Manager.parent_id, func.count(models.Manager.id))
        .where(models.Manager.parent_id.in_(manager_ids))
        .group_by(models.Manager.parent_id)
    ).all()
    return {row[0]: row[1] for row in rows if row[0] is not None}


def _to_out(
    m: models.Manager, sub_count: int = 0, user_count: int = 0
) -> schemas.ManagerOut:
    return schemas.ManagerOut(
        id=m.id,
        parent_id=m.parent_id,
        username=m.username,
        full_name=m.full_name,
        phone=m.phone,
        email=m.email,
        address=m.address,
        notes=m.notes,
        enabled=m.enabled,
        is_root=m.is_root,
        balance=m.balance,
        profit_share_percent=m.profit_share_percent,
        max_users_quota=m.max_users_quota,
        permissions=list(m.permissions or []),
        allowed_profile_ids=list(m.allowed_profile_ids or []),
        created_at=m.created_at,
        updated_at=m.updated_at,
        sub_count=sub_count,
        user_count=user_count,
    )


@router.get("", response_model=list[schemas.ManagerOut])
def list_managers(
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.view")),
) -> list[schemas.ManagerOut]:
    visible = visible_manager_ids(db, current)
    rows = (
        db.execute(
            select(models.Manager)
            .where(models.Manager.id.in_(visible))
            .order_by(models.Manager.is_root.desc(), models.Manager.username.asc())
        )
        .scalars()
        .all()
    )
    sub_counts = _sub_counts(db, visible)
    user_counts = _user_counts(db, visible)
    return [
        _to_out(m, sub_counts.get(m.id, 0), user_counts.get(m.id, 0)) for m in rows
    ]


@router.get("/tree", response_model=list[schemas.ManagerTreeNode])
def manager_tree(
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.view")),
) -> list[schemas.ManagerTreeNode]:
    visible = visible_manager_ids(db, current)
    rows = (
        db.execute(
            select(models.Manager)
            .where(models.Manager.id.in_(visible))
            .order_by(models.Manager.username.asc())
        )
        .scalars()
        .all()
    )
    user_counts = _user_counts(db, visible)
    by_parent: dict[int | None, list[models.Manager]] = defaultdict(list)
    for m in rows:
        by_parent[m.parent_id].append(m)

    def build(m: models.Manager) -> schemas.ManagerTreeNode:
        return schemas.ManagerTreeNode(
            id=m.id,
            username=m.username,
            full_name=m.full_name,
            enabled=m.enabled,
            is_root=m.is_root,
            user_count=user_counts.get(m.id, 0),
            children=[build(c) for c in by_parent.get(m.id, [])],
        )

    # Roots from the current manager's perspective: either real roots
    # (parent_id is None) or whose parent isn't in the visible set.
    roots: list[models.Manager] = [
        m for m in rows if m.parent_id is None or m.parent_id not in visible
    ]
    return [build(m) for m in roots]


@router.get("/{manager_id}", response_model=schemas.ManagerOut)
def get_manager(
    manager_id: int,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.view")),
) -> schemas.ManagerOut:
    visible = visible_manager_ids(db, current)
    if manager_id not in visible:
        raise HTTPException(status_code=404, detail="Manager not found")
    m = db.get(models.Manager, manager_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Manager not found")
    sub_count = (
        db.execute(
            select(func.count(models.Manager.id)).where(
                models.Manager.parent_id == manager_id
            )
        ).scalar()
        or 0
    )
    user_count = (
        db.execute(
            select(func.count(models.SubscriberProfile.username)).where(
                models.SubscriberProfile.manager_id == manager_id
            )
        ).scalar()
        or 0
    )
    return _to_out(m, sub_count, user_count)


@router.post(
    "",
    response_model=schemas.ManagerOut,
    status_code=status.HTTP_201_CREATED,
)
def create_manager(
    payload: schemas.ManagerCreate,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.manage")),
) -> schemas.ManagerOut:
    # Determine and validate parent: defaults to current manager.
    parent_id = payload.parent_id if payload.parent_id is not None else current.id
    visible = visible_manager_ids(db, current)
    if parent_id not in visible:
        raise HTTPException(status_code=403, detail="Parent manager is out of scope")

    # Username must be unique.
    exists = db.execute(
        select(models.Manager).where(models.Manager.username == payload.username).limit(1)
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Username already exists")

    # Sanitize permissions: cannot grant more than the creator has, and never `*`.
    requested = permissions.normalize_permissions(payload.permissions)
    if not current.is_root:
        own = set(current.permissions or [])
        if "*" not in own:
            requested = [p for p in requested if p in own]
    requested = [p for p in requested if p != permissions.WILDCARD]

    new_m = models.Manager(
        parent_id=parent_id,
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        address=payload.address,
        notes=payload.notes,
        enabled=payload.enabled,
        is_root=False,
        balance=payload.balance,
        profit_share_percent=payload.profit_share_percent,
        max_users_quota=payload.max_users_quota,
        permissions=requested,
        allowed_profile_ids=list(payload.allowed_profile_ids or []),
    )
    db.add(new_m)
    db.commit()
    db.refresh(new_m)
    return _to_out(new_m)


@router.patch("/{manager_id}", response_model=schemas.ManagerOut)
def update_manager(
    manager_id: int,
    payload: schemas.ManagerUpdate,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.manage")),
) -> schemas.ManagerOut:
    visible = visible_manager_ids(db, current)
    if manager_id not in visible:
        raise HTTPException(status_code=404, detail="Manager not found")
    m = db.get(models.Manager, manager_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Manager not found")
    # The root manager cannot be disabled or have its is_root flag changed.
    fields = payload.model_dump(exclude_unset=True)

    is_self = manager_id == current.id

    if m.is_root and "enabled" in fields and fields["enabled"] is False:
        raise HTTPException(status_code=400, detail="Cannot disable the root manager")

    # A non-root manager cannot disable themselves (would lock them out).
    if is_self and not current.is_root and fields.get("enabled") is False:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")

    # A non-root manager cannot grant themselves financial/quota fields — those
    # are only adjustable by an ancestor. (Without this, a sub-manager with
    # `managers.manage` could PATCH /api/managers/{own-id} and set their own
    # balance / profit share / quota.)
    if is_self and not current.is_root:
        sensitive_keys = {
            "balance",
            "profit_share_percent",
            "max_users_quota",
            "allowed_profile_ids",
        }
        for key in sensitive_keys:
            if key in fields:
                raise HTTPException(
                    status_code=403,
                    detail=f"Cannot modify your own '{key}' — ask a parent manager.",
                )

    if "password" in fields and fields["password"]:
        m.password_hash = hash_password(fields.pop("password"))
    else:
        fields.pop("password", None)

    if "permissions" in fields:
        requested = permissions.normalize_permissions(fields["permissions"])
        if not current.is_root:
            own = set(current.permissions or [])
            if "*" not in own:
                requested = [p for p in requested if p in own]
        requested = [p for p in requested if p != permissions.WILDCARD]
        # Self-PATCH cannot change one's own permission set — only an ancestor can.
        if is_self and not current.is_root and set(requested) != set(m.permissions or []):
            raise HTTPException(
                status_code=403,
                detail="Cannot modify your own permissions — ask a parent manager.",
            )
        fields["permissions"] = requested

    for k, v in fields.items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return _to_out(m)


@router.delete("/{manager_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_manager(
    manager_id: int,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.manage")),
) -> None:
    if manager_id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    visible = visible_manager_ids(db, current)
    if manager_id not in visible:
        raise HTTPException(status_code=404, detail="Manager not found")
    m = db.get(models.Manager, manager_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Manager not found")
    if m.is_root:
        raise HTTPException(status_code=400, detail="Cannot delete the root manager")

    subtree = manager_subtree_ids(db, manager_id)
    # Reject if there are subscribers — operator must reassign them first.
    sub_count = (
        db.execute(
            select(func.count(models.SubscriberProfile.username)).where(
                models.SubscriberProfile.manager_id.in_(subtree)
            )
        ).scalar()
        or 0
    )
    if sub_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Manager (or its sub-tree) still owns {sub_count} subscribers. "
                "Reassign or delete them before deleting the manager."
            ),
        )
    # Delete deepest first (descendants → ancestor) to satisfy FK RESTRICT.
    desc = sorted(subtree - {manager_id})
    while desc:
        deepest = desc.pop()
        sub = db.get(models.Manager, deepest)
        if sub is not None:
            db.delete(sub)
    db.delete(m)
    db.commit()


# --- Phase 3: ledger / credit / debit ----------------------------------


def _ledger_to_out(
    entry: models.ManagerLedger,
    invoice_number: str | None,
    recorded_by_username: str | None,
) -> schemas.ManagerLedgerEntry:
    return schemas.ManagerLedgerEntry(
        id=entry.id,
        manager_id=entry.manager_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        balance_after=entry.balance_after,
        related_invoice_id=entry.related_invoice_id,
        related_invoice_number=invoice_number,
        recorded_by_manager_id=entry.recorded_by_manager_id,
        recorded_by_username=recorded_by_username,
        description=entry.description,
        notes=entry.notes,
        created_at=entry.created_at,
    )


def _ensure_manager_in_scope(
    db: Session, manager_id: int, current: models.Manager
) -> models.Manager:
    visible = visible_manager_ids(db, current)
    if manager_id not in visible:
        raise HTTPException(status_code=404, detail="Manager not found")
    m = db.get(models.Manager, manager_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Manager not found")
    return m


@router.get(
    "/{manager_id}/ledger",
    response_model=schemas.Paginated[schemas.ManagerLedgerEntry],
)
def get_manager_ledger(
    manager_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.view")),
) -> schemas.Paginated[schemas.ManagerLedgerEntry]:
    _ensure_manager_in_scope(db, manager_id, current)

    base = select(models.ManagerLedger).where(
        models.ManagerLedger.manager_id == manager_id
    )
    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()
    rows = list(
        db.execute(
            base.order_by(desc(models.ManagerLedger.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    invoice_ids = {r.related_invoice_id for r in rows if r.related_invoice_id}
    invoice_numbers: dict[int, str] = {}
    if invoice_ids:
        ir = db.execute(
            select(models.Invoice.id, models.Invoice.invoice_number).where(
                models.Invoice.id.in_(invoice_ids)
            )
        ).all()
        invoice_numbers = {iid: inum for iid, inum in ir}

    recorder_ids = {r.recorded_by_manager_id for r in rows if r.recorded_by_manager_id}
    recorder_names: dict[int, str] = {}
    if recorder_ids:
        rr = db.execute(
            select(models.Manager.id, models.Manager.username).where(
                models.Manager.id.in_(recorder_ids)
            )
        ).all()
        recorder_names = {mid: uname for mid, uname in rr}

    items = [
        _ledger_to_out(
            r,
            invoice_number=(
                invoice_numbers.get(r.related_invoice_id)
                if r.related_invoice_id
                else None
            ),
            recorded_by_username=(
                recorder_names.get(r.recorded_by_manager_id)
                if r.recorded_by_manager_id
                else None
            ),
        )
        for r in rows
    ]
    return schemas.Paginated(items=items, total=int(total), page=page, page_size=page_size)


def _post_ledger(
    db: Session,
    *,
    manager_id: int,
    entry_type: str,
    amount: Decimal,
    description: str | None,
    notes: str | None,
    recorded_by_manager_id: int | None,
    related_invoice_id: int | None = None,
) -> models.ManagerLedger:
    """Append a ledger entry and update Manager.balance. Caller commits."""
    m = db.get(models.Manager, manager_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Manager not found")
    new_balance = (m.balance or Decimal("0")) + amount
    m.balance = new_balance
    entry = models.ManagerLedger(
        manager_id=manager_id,
        entry_type=entry_type,
        amount=amount,
        balance_after=new_balance,
        related_invoice_id=related_invoice_id,
        recorded_by_manager_id=recorded_by_manager_id,
        description=description,
        notes=notes,
    )
    db.add(entry)
    db.flush()
    return entry


@router.post(
    "/{manager_id}/credit",
    response_model=schemas.ManagerLedgerEntry,
    status_code=status.HTTP_201_CREATED,
)
def credit_manager(
    manager_id: int,
    payload: schemas.ManagerCreditDebitRequest,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.manage")),
) -> schemas.ManagerLedgerEntry:
    """Add funds to a child manager. Cannot self-credit."""
    if manager_id == current.id and not current.is_root:
        raise HTTPException(
            status_code=403,
            detail="Cannot credit yourself — ask a parent manager.",
        )
    m = _ensure_manager_in_scope(db, manager_id, current)
    if m.is_root:
        raise HTTPException(status_code=400, detail="Root manager balance is not managed")

    amount = Decimal(payload.amount)
    entry = _post_ledger(
        db,
        manager_id=manager_id,
        entry_type="credit",
        amount=amount,
        description=payload.description or "Manual credit",
        notes=payload.notes,
        recorded_by_manager_id=current.id,
    )
    db.commit()
    db.refresh(entry)
    return _ledger_to_out(entry, None, current.username)


@router.post(
    "/{manager_id}/debit",
    response_model=schemas.ManagerLedgerEntry,
    status_code=status.HTTP_201_CREATED,
)
def debit_manager(
    manager_id: int,
    payload: schemas.ManagerCreditDebitRequest,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(require_permission("managers.manage")),
) -> schemas.ManagerLedgerEntry:
    """Withdraw funds from a child manager (e.g. recover unpaid balance)."""
    if manager_id == current.id and not current.is_root:
        raise HTTPException(
            status_code=403,
            detail="Cannot debit yourself — ask a parent manager.",
        )
    m = _ensure_manager_in_scope(db, manager_id, current)
    if m.is_root:
        raise HTTPException(status_code=400, detail="Root manager balance is not managed")

    amount = Decimal(payload.amount)
    entry = _post_ledger(
        db,
        manager_id=manager_id,
        entry_type="debit",
        amount=-amount,
        description=payload.description or "Manual debit",
        notes=payload.notes,
        recorded_by_manager_id=current.id,
    )
    db.commit()
    db.refresh(entry)
    return _ledger_to_out(entry, None, current.username)
