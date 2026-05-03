"""Phase 2 — RBAC permission catalogue + helpers.

A `Manager` carries a list of permission strings. The wildcard `*`
grants everything. The root admin always has `*` regardless of the
stored value.
"""

from typing import Final

# Granular permissions exposed to sub-managers.
PERMISSIONS: Final[tuple[str, ...]] = (
    "users.view",
    "users.create",
    "users.edit",
    "users.delete",
    "users.renew",
    "users.toggle",
    "profiles.view",
    "profiles.manage",
    "managers.view",
    "managers.manage",
    "invoices.view",
    "invoices.manage",
    "reports.view",
    "settings.manage",
    # Phase 4 — WhatsApp + notifications
    "notifications.view",
    "notifications.send",
    "notifications.templates.manage",
    "notifications.whatsapp.manage",
)

WILDCARD: Final[str] = "*"


def has_permission(manager_perms: list[str] | None, is_root: bool, perm: str) -> bool:
    """Return True if a manager (`is_root` flag + perms list) has `perm`."""
    if is_root:
        return True
    if not manager_perms:
        return False
    if WILDCARD in manager_perms:
        return True
    return perm in manager_perms


def normalize_permissions(perms: list[str] | None) -> list[str]:
    """Filter incoming permission list to only the catalogued values."""
    if not perms:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for p in perms:
        if p == WILDCARD or p in PERMISSIONS:
            if p not in seen:
                seen.add(p)
                out.append(p)
    return out
