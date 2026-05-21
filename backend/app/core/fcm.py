"""Firebase Cloud Messaging sender for native (Android) clients.

Optional: if the service account JSON is missing, every send is a no-op
so the rest of the app keeps working. Configure via env:

  FCM_SERVICE_ACCOUNT_JSON_PATH  Absolute or relative path to the
                                 service account JSON downloaded from
                                 the Firebase console. Defaults to
                                 data/fcm_service_account.json.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

_DEFAULT_PATH = "data/fcm_service_account.json"
_initialized = False
_disabled = False


def _ensure_initialized() -> bool:
    """Lazy-init the firebase_admin SDK once we know the JSON exists."""
    global _initialized, _disabled
    if _initialized:
        return True
    if _disabled:
        return False
    path = Path(os.getenv("FCM_SERVICE_ACCOUNT_JSON_PATH", _DEFAULT_PATH))
    if not path.exists():
        log.info("FCM disabled — no service account at %s", path)
        _disabled = True
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(str(path)))
        _initialized = True
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("FCM init failed (%s) — disabling", exc)
        _disabled = True
        return False


def send_fcm(
    token: str,
    title: str,
    body: str,
    data: Optional[dict[str, str]] = None,
) -> Optional[str]:
    """Send a notification to a single FCM token. Returns the message id
    on success, None when FCM isn't configured. Raises on transport
    errors so the caller can decide to evict a dead token."""
    if not _ensure_initialized():
        return None
    from firebase_admin import messaging

    msg = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        token=token,
        data={k: str(v) for k, v in (data or {}).items()},
    )
    return messaging.send(msg)
