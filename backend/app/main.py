import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from . import models
from .config import settings
from .database import Base, SessionLocal, engine
from .routers import (
    accounting,
    auth,
    dashboard,
    groups,
    managers,
    nas,
    profiles,
    system,
    users,
)
from .security import get_current_manager, hash_password

log = logging.getLogger("uvicorn.error")


def _bootstrap_admin() -> None:
    """Create the manager + ISP-model tables if missing and seed the root manager."""
    Base.metadata.create_all(
        engine,
        tables=[
            models.Manager.__table__,
            models.Profile.__table__,
            models.SubscriberProfile.__table__,
        ],
    )
    with SessionLocal() as db:
        existing = db.execute(select(models.Manager).limit(1)).scalar_one_or_none()
        if existing is None:
            root = models.Manager(
                parent_id=None,
                username=settings.initial_admin_username,
                password_hash=hash_password(settings.initial_admin_password),
                full_name="Root admin",
                enabled=True,
                is_root=True,
                permissions=["*"],
                allowed_profile_ids=[],
            )
            db.add(root)
            db.commit()
            log.warning(
                "Seeded root manager '%s'. CHANGE THE PASSWORD on first login.",
                settings.initial_admin_username,
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _bootstrap_admin()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# Auth endpoints are public (login). /auth/me and /auth/change-password gate themselves.
app.include_router(auth.router, prefix="/api")

# All RADIUS data routers require a valid manager JWT.
auth_dep = [Depends(get_current_manager)]
app.include_router(dashboard.router, prefix="/api", dependencies=auth_dep)
app.include_router(users.router, prefix="/api", dependencies=auth_dep)
app.include_router(groups.router, prefix="/api", dependencies=auth_dep)
app.include_router(nas.router, prefix="/api", dependencies=auth_dep)
app.include_router(accounting.router, prefix="/api", dependencies=auth_dep)
app.include_router(profiles.router, prefix="/api", dependencies=auth_dep)
app.include_router(system.router, prefix="/api", dependencies=auth_dep)
app.include_router(managers.router, prefix="/api", dependencies=auth_dep)
