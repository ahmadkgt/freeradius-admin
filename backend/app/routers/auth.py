from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, permissions, schemas
from ..database import get_db
from ..security import (
    create_access_token,
    get_current_manager,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _effective_permissions(m: models.Manager) -> list[str]:
    if m.is_root or "*" in (m.permissions or []):
        return list(permissions.PERMISSIONS)
    return list(m.permissions or [])


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)) -> schemas.LoginResponse:
    manager = db.execute(
        select(models.Manager).where(models.Manager.username == payload.username).limit(1)
    ).scalar_one_or_none()
    if (
        manager is None
        or not manager.enabled
        or not verify_password(payload.password, manager.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires_at = create_access_token(subject=manager.username)
    return schemas.LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_at=expires_at,
        username=manager.username,
    )


@router.get("/me", response_model=schemas.AdminMe)
def me(current: models.Manager = Depends(get_current_manager)) -> schemas.AdminMe:
    return schemas.AdminMe(
        id=current.id,
        username=current.username,
        full_name=current.full_name,
        is_root=current.is_root,
        enabled=current.enabled,
        parent_id=current.parent_id,
        permissions=list(current.permissions or []),
        effective_permissions=_effective_permissions(current),
        balance=current.balance,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current: models.Manager = Depends(get_current_manager),
) -> None:
    if not verify_password(payload.current_password, current.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    current.password_hash = hash_password(payload.new_password)
    db.add(current)
    db.commit()
