"""Web Push helpers.

VAPID keypair lifecycle:
  - If env vars VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (PEM) are set, use them.
  - Otherwise generate once on first boot and persist to data/vapid_keys.json,
    re-using the file on subsequent restarts.

The public key is returned to the SPA as URL-safe base64 of the raw
uncompressed EC public point — the format browsers expect for
PushManager.subscribe({ applicationServerKey: ... }).
"""
from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

log = logging.getLogger(__name__)

_KEYS_PATH = "data/vapid_keys.json"


@dataclass
class VapidKeys:
    public_b64url: str  # for the browser
    private_pem: str  # for signing webpush
    subject: str  # mailto: or https URL


def _raw_public_point(vapid: Vapid) -> bytes:
    return vapid.public_key.public_bytes(
        Encoding.X962, PublicFormat.UncompressedPoint
    )


def _to_b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


_cached: Optional[VapidKeys] = None


def get_vapid_keys() -> VapidKeys:
    global _cached
    if _cached is not None:
        return _cached

    subject = os.getenv("VAPID_SUBJECT", "mailto:alfred@example.com")

    pub_env = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    priv_env = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    if pub_env and priv_env:
        _cached = VapidKeys(public_b64url=pub_env, private_pem=priv_env, subject=subject)
        return _cached

    if os.path.exists(_KEYS_PATH):
        with open(_KEYS_PATH, "r") as f:
            data = json.load(f)
        _cached = VapidKeys(
            public_b64url=data["public_key"],
            private_pem=data["private_pem"],
            subject=subject,
        )
        return _cached

    # Generate a new pair.
    vapid = Vapid()
    vapid.generate_keys()
    public_b64url = _to_b64url(_raw_public_point(vapid))
    private_pem = vapid.private_pem().decode("ascii")

    os.makedirs(os.path.dirname(_KEYS_PATH), exist_ok=True)
    with open(_KEYS_PATH, "w") as f:
        json.dump({"public_key": public_b64url, "private_pem": private_pem}, f)
    log.info("Generated VAPID keys and persisted to %s", _KEYS_PATH)

    _cached = VapidKeys(
        public_b64url=public_b64url, private_pem=private_pem, subject=subject
    )
    return _cached


def send_push(
    endpoint: str, p256dh: str, auth: str, payload: dict
) -> tuple[bool, Optional[int]]:
    """Send a Web Push to one subscription. Returns (ok, status_code).
    On 404/410 the caller should evict the dead subscription from the DB."""
    keys = get_vapid_keys()
    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=json.dumps(payload),
            vapid_private_key=keys.private_pem,
            vapid_claims={"sub": keys.subject},
            ttl=24 * 3600,
        )
        return True, None
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        log.warning("Web Push failed: %s (status=%s)", exc, status_code)
        return False, status_code
