"""Thin client for the local Baileys-based WhatsApp gateway.

The gateway runs as a separate container (`whatsapp` service in
docker-compose) on the internal docker network. It exposes a small REST
surface secured with a shared bearer token (`WHATSAPP_API_KEY`):

    GET  /status
    GET  /qr.png              -> raw PNG bytes (404 when already paired)
    POST /send  {to, text}
    POST /disconnect

Designed to be the single integration point for the WhatsApp channel —
swapping providers (Ultramsg, etc.) later just means pointing
`WHATSAPP_GATEWAY_URL` at a different shim that exposes the same shape.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GatewayStatus:
    connected: bool
    jid: str | None
    has_qr: bool
    last_error: str | None


class WhatsAppGatewayError(RuntimeError):
    """Raised when the gateway is unreachable or returns a non-success."""


_PHONE_RE = re.compile(r"\D+")


def normalize_phone(raw: str | None) -> str | None:
    """Strip everything except digits; drop a leading `00`. Returns None
    if the result is empty (no usable digits)."""
    if not raw:
        return None
    digits = _PHONE_RE.sub("", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    return digits or None


class WhatsAppGateway:
    """HTTP client for the gateway; one shared instance per app."""

    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        settings = get_settings()
        self._base_url = (base_url or settings.whatsapp_gateway_url or "").rstrip("/")
        self._api_key = api_key or settings.whatsapp_api_key or ""
        # Short timeout: a stuck gateway must not hang the whole request.
        self._timeout = httpx.Timeout(8.0, connect=3.0)

    @property
    def configured(self) -> bool:
        return bool(self._base_url) and bool(self._api_key)

    def _headers(self) -> dict[str, str]:
        return {"X-API-Key": self._api_key}

    def status(self) -> GatewayStatus:
        if not self.configured:
            return GatewayStatus(
                connected=False, jid=None, has_qr=False, last_error="not configured"
            )
        try:
            resp = httpx.get(
                f"{self._base_url}/status",
                headers=self._headers(),
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return GatewayStatus(
                connected=bool(data.get("connected")),
                jid=data.get("jid"),
                has_qr=bool(data.get("has_qr")),
                last_error=data.get("last_error"),
            )
        except httpx.HTTPError as exc:
            logger.warning("whatsapp gateway status failed: %s", exc)
            return GatewayStatus(connected=False, jid=None, has_qr=False, last_error=str(exc))

    def qr_png(self) -> bytes | None:
        """Return the current QR as PNG bytes, or None if the gateway has
        nothing to show (already paired) or is unreachable."""
        if not self.configured:
            return None
        try:
            resp = httpx.get(
                f"{self._base_url}/qr.png",
                headers=self._headers(),
                timeout=self._timeout,
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.content
        except httpx.HTTPError as exc:
            logger.warning("whatsapp gateway qr fetch failed: %s", exc)
            return None

    def send(self, to: str, text: str) -> tuple[bool, str | None, str | None]:
        """Send a message. Returns (ok, provider_message_id, error)."""
        if not self.configured:
            return False, None, "WhatsApp gateway not configured"
        digits = normalize_phone(to)
        if not digits:
            return False, None, "invalid phone number"
        try:
            resp = httpx.post(
                f"{self._base_url}/send",
                headers=self._headers(),
                json={"to": digits, "text": text},
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            logger.warning("whatsapp send failed: %s", exc)
            return False, None, str(exc)
        if resp.status_code >= 400:
            try:
                err = resp.json().get("error") or resp.text
            except Exception:
                err = resp.text or f"HTTP {resp.status_code}"
            return False, None, err[:512]
        try:
            data = resp.json()
        except Exception:
            return True, None, None
        return True, data.get("message_id"), None

    def disconnect(self) -> bool:
        if not self.configured:
            return False
        try:
            resp = httpx.post(
                f"{self._base_url}/disconnect",
                headers=self._headers(),
                timeout=self._timeout,
            )
            resp.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            logger.warning("whatsapp disconnect failed: %s", exc)
            return False


_gateway: WhatsAppGateway | None = None


def get_gateway() -> WhatsAppGateway:
    """FastAPI dependency / module-level singleton."""
    global _gateway
    if _gateway is None:
        _gateway = WhatsAppGateway()
    return _gateway
