"""Phase 2 — managers/resellers CRUD with hierarchy and RBAC scoping."""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
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
