from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/system", tags=["system"])


def _read_first_line(path: Path) -> str | None:
    try:
        return path.read_text().splitlines()[0]
    except OSError:
        return None


def _uptime_seconds() -> int:
    line = _read_first_line(Path("/proc/uptime"))
    if not line:
        return 0
    try:
        return int(float(line.split()[0]))
    except (IndexError, ValueError):
        return 0


def _load_avg() -> list[float]:
    line = _read_first_line(Path("/proc/loadavg"))
    if not line:
        return []
    parts = line.split()
    out: list[float] = []
    for p in parts[:3]:
        try:
            out.append(float(p))
        except ValueError:
            return out
    return out


def _meminfo() -> dict[str, int]:
    info: dict[str, int] = {}
    try:
        with open("/proc/meminfo", encoding="ascii") as f:
            for raw in f:
                key, _, rest = raw.partition(":")
                value = rest.strip().split()
                if len(value) >= 1:
                    try:
                        info[key.strip()] = int(value[0]) * 1024  # kB → bytes
                    except ValueError:
                        continue
    except OSError:
        return {}
    return info


def _disk_usage(path: str = "/") -> tuple[int, int] | None:
    try:
        import shutil

        total, _used, free = shutil.disk_usage(path)
        return total, free
    except OSError:
        return None


def _db_size_bytes(db: Session) -> int | None:
    try:
        row = db.execute(
            text(
                "SELECT COALESCE(SUM(data_length + index_length), 0) "
                "FROM information_schema.tables WHERE table_schema = DATABASE()"
            )
        ).scalar_one()
        return int(row) if row is not None else None
    except Exception:
        return None


def _timezone_name() -> str:
    try:
        link = Path("/etc/localtime").resolve()
        zoneinfo = "/usr/share/zoneinfo/"
        s = str(link)
        if zoneinfo in s:
            return s.split(zoneinfo, 1)[1]
    except OSError:
        pass
    return datetime.now().astimezone().tzname() or "UTC"


@router.get("/info", response_model=schemas.SystemInfo)
def system_info(db: Session = Depends(get_db)) -> schemas.SystemInfo:
    mem = _meminfo()
    mem_total = mem.get("MemTotal")
    mem_avail = mem.get("MemAvailable")
    mem_pct: float | None = None
    if mem_total and mem_avail is not None:
        mem_pct = round(((mem_total - mem_avail) / mem_total) * 100, 1)

    du = _disk_usage("/")
    disk_total = du[0] if du else None
    disk_free = du[1] if du else None
    disk_pct: float | None = None
    if disk_total and disk_free is not None:
        disk_pct = round(((disk_total - disk_free) / disk_total) * 100, 1)

    user_count = db.execute(
        select(func.count(func.distinct(models.RadCheck.username))).where(
            models.RadCheck.username != ""
        )
    ).scalar_one()
    profile_count = db.execute(select(func.count(models.Profile.id))).scalar_one()
    active_sessions = db.execute(
        select(func.count()).where(models.RadAcct.acctstoptime.is_(None))
    ).scalar_one()

    return schemas.SystemInfo(
        version="0.2.0",
        server_time=datetime.now(UTC),
        timezone=_timezone_name(),
        uptime_seconds=_uptime_seconds(),
        load_avg=_load_avg(),
        memory_total_bytes=mem_total,
        memory_available_bytes=mem_avail,
        memory_used_percent=mem_pct,
        disk_total_bytes=disk_total,
        disk_free_bytes=disk_free,
        disk_used_percent=disk_pct,
        db_size_bytes=_db_size_bytes(db),
        active_connections=int(active_sessions),
        user_count=int(user_count),
        profile_count=int(profile_count),
    )
