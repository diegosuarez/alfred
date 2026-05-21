"""Thin HTTP client around the Alfred backend.

All endpoints are prefixed with /api by the backend; this client adds
that prefix and the Bearer token so callers can speak in plain paths.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .config import Config


class AlfredClient:
    def __init__(self, config: Config) -> None:
        if not config.token:
            raise RuntimeError(
                "No PAT configured. Run `alfred config set-token <token>` "
                "first — mint a token in the web UI under Perfil → "
                "Tokens API."
            )
        base = config.api_url.rstrip("/")
        self._http = httpx.Client(
            base_url=f"{base}/api",
            headers={"Authorization": f"Bearer {config.token}"},
            timeout=30.0,
            # Default off — Alfred typically lives behind a Tailscale
            # host with a self-signed cert. Override via verify_ssl=true
            # in config.toml when targeting a publicly-trusted host.
            verify=config.verify_ssl,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "AlfredClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ----- low level -----------------------------------------------------

    def _request(self, method: str, path: str, **kw: Any) -> Any:
        resp = self._http.request(method, path, **kw)
        if resp.status_code == 204:
            return None
        if resp.is_error:
            detail = ""
            try:
                detail = resp.json().get("detail", "")
            except Exception:  # noqa: BLE001
                detail = resp.text
            raise RuntimeError(
                f"{method} {path} → {resp.status_code}: {detail}"
            )
        return resp.json()

    # ----- contexts ------------------------------------------------------

    def list_contexts(self) -> list[dict]:
        return self._request("GET", "/contexts")

    # ----- boards --------------------------------------------------------

    def list_boards(self, context_id: Optional[int] = None) -> list[dict]:
        params = {"context_id": context_id} if context_id is not None else None
        return self._request("GET", "/boards", params=params)

    def get_board(self, board_id: int) -> dict:
        return self._request("GET", f"/boards/{board_id}")

    def update_context(self, context_id: int, body: dict) -> dict:
        return self._request("PUT", f"/contexts/{context_id}", json=body)

    def update_board(self, board_id: int, body: dict) -> dict:
        return self._request("PUT", f"/boards/{board_id}", json=body)

    # ----- tasks ---------------------------------------------------------

    def update_task(self, task_id: int, body: dict) -> dict:
        return self._request("PUT", f"/tasks/{task_id}", json=body)

    def add_reminder(self, task_id: int, remind_at_iso: str) -> dict:
        return self._request(
            "POST",
            f"/tasks/{task_id}/reminders",
            json={"remind_at": remind_at_iso},
        )

    def create_task(
        self,
        column_id: int,
        title: str,
        description: Optional[str] = None,
        priority: Optional[str] = None,
        due_date: Optional[str] = None,
    ) -> dict:
        body: dict[str, Any] = {"title": title}
        if description is not None:
            body["description"] = description
        if priority is not None:
            body["priority"] = priority
        if due_date is not None:
            body["due_date"] = due_date
        return self._request("POST", f"/columns/{column_id}/tasks", json=body)
