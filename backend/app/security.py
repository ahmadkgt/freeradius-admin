"""Password hashing and JWT token utilities for panel auth.

In Phase 2 we authenticate against the `managers` table (the legacy
`admin_users` table was removed). The currently-authenticated subject
is exposed via the `get_current_manager` dependency. Routers that need
permission gating use `require_permission(...)`.
"""

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, permissions
from .config import settings
from .database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    *, subject: str, expires_minutes: int | None = None
) -> tuple[str, datetime]:
    expire = datetime.now(tz=UTC) + timedelta(
        minutes=expires_minutes or settings.jwt_expire_minutes
    )
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(tz=UTC)}
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expire


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return sub


def get_current_manager(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Manager:
    """Resolve the JWT into a `Manager` row, or 401."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = decode_access_token(token)
    manager = db.execute(
        select(models.Manager).where(models.Manager.username == username).limit(1)
    ).scalar_one_or_none()
    if manager is None or not manager.enabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return manager


# Backwards-compat alias for routers that historically used `get_current_admin`.
get_current_admin = get_current_manager


def require_permission(*required: str):
    """Dependency factory that 403s if the current manager lacks any of `required`."""

    needed: tuple[str, ...] = required

    def _checker(
        current: models.Manager = Depends(get_current_manager),
    ) -> models.Manager:
        for perm in needed:
            if not permissions.has_permission(
                current.permissions or [], current.is_root, perm
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permission: {perm}",
                )
        return current

    return _checker


def manager_subtree_ids(db: Session, root_id: int) -> set[int]:
    """Return the set of manager IDs that are `root_id` plus all its descendants."""
    ids: set[int] = {root_id}
    frontier: set[int] = {root_id}
    while frontier:
        rows: Iterable[int] = (
            db.execute(
                select(models.Manager.id).where(models.Manager.parent_id.in_(frontier))
            )
            .scalars()
            .all()
        )
        new = {r for r in rows if r not in ids}
        if not new:
            break
        ids.update(new)
        frontier = new
    return ids


def visible_manager_ids(db: Session, current: models.Manager) -> set[int]:
    """Manager IDs the current user can see (their own subtree).

    Root admins see everyone (returns the set of all manager IDs).
    """
    if current.is_root:
        return set(db.execute(select(models.Manager.id)).scalars().all())
    return manager_subtree_ids(db, current.id)
