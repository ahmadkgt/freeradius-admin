from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import (
    create_access_token,
    get_current_admin,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)) -> schemas.LoginResponse:
    user = db.execute(
        select(models.AdminUser).where(models.AdminUser.username == payload.username).limit(1)
    ).scalar_one_or_none()
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires_at = create_access_token(subject=user.username)
    return schemas.LoginResponse(
        access_token=token, token_type="bearer", expires_at=expires_at, username=user.username
    )


@router.get("/me", response_model=schemas.AdminMe)
def me(current: models.AdminUser = Depends(get_current_admin)) -> models.AdminUser:
    return current


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current: models.AdminUser = Depends(get_current_admin),
) -> None:
    if not verify_password(payload.current_password, current.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    current.password_hash = hash_password(payload.new_password)
    db.add(current)
    db.commit()
