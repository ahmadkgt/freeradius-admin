"""Mustache-lite renderer for notification templates.

Template bodies use `{{variable}}` placeholders. The variables come from
a small known set (subscriber + invoice fields), so we deliberately
implement a minimal pattern matcher rather than depending on Jinja2 —
templates are user-authored strings and we want predictable, side-effect
free rendering.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def _format(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, Decimal):
        # Strip trailing zeros for amounts; e.g. 12500.00 -> 12500
        normalized = value.normalize()
        text = format(normalized, "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return text or "0"
    return str(value)


def render(body: str | None, variables: dict[str, Any]) -> str:
    """Replace every ``{{name}}`` in `body` with the formatted value of
    `variables[name]`. Unknown placeholders are left as the empty string
    so an outdated template never blocks delivery."""
    if not body:
        return ""

    def _replace(match: re.Match[str]) -> str:
        name = match.group(1)
        return _format(variables.get(name))

    return _PLACEHOLDER_RE.sub(_replace, body)


def known_variables() -> list[str]:
    """For the UI: the variable names the renderer recognises."""
    return [
        "username",
        "full_name",
        "phone",
        "expiration_at",
        "debt",
        "balance",
        "profile_name",
        "profile_id",
        "invoice_number",
        "amount",
        "manager_username",
    ]
