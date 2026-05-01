from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import accounting, dashboard, groups, nas, users

app = FastAPI(title=settings.app_name, version="0.1.0")

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


app.include_router(dashboard.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(nas.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
