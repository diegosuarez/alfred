from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core import push as push_helper
from app.main import _dispatch_due_reminders


async def _make_task(client: AsyncClient, headers: dict[str, str]) -> int:
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=headers)
    ).json()
    col_id = detail["columns"][0]["id"]
    task = (
        await client.post(
            f"/api/columns/{col_id}/tasks",
            json={"title": "Remind me"},
            headers=headers,
        )
    ).json()
    return task["id"]


async def test_vapid_public_key_endpoint(client: AsyncClient) -> None:
    resp = await client.get("/api/push/vapid-public-key")
    assert resp.status_code == 200
    body = resp.json()
    # URL-safe base64 of a 65-byte EC point — well over 80 chars.
    assert len(body["public_key"]) > 60


async def test_subscribe_and_unsubscribe(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    body = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc123",
        "keys": {"p256dh": "p", "auth": "a"},
    }
    resp = await client.post("/api/push/subscribe", json=body, headers=auth_headers)
    assert resp.status_code == 200

    # Re-subscribing the same endpoint updates rather than duplicates.
    body["keys"]["auth"] = "new-auth"
    resp2 = await client.post(
        "/api/push/subscribe", json=body, headers=auth_headers
    )
    assert resp2.status_code == 200
    assert resp2.json()["id"] == resp.json()["id"]

    drop = await client.post(
        "/api/push/unsubscribe", json=body, headers=auth_headers
    )
    assert drop.status_code == 204


async def test_dispatch_sends_due_reminders_and_marks_sent(
    client: AsyncClient,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task_id = await _make_task(client, auth_headers)

    # Reminder scheduled in the past so the next dispatch tick picks it.
    past = (datetime.utcnow() - timedelta(minutes=1)).isoformat()
    await client.post(
        f"/api/tasks/{task_id}/reminders",
        json={"remind_at": past},
        headers=auth_headers,
    )

    # Subscribe a fake push endpoint for this user.
    await client.post(
        "/api/push/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
            "keys": {"p256dh": "p", "auth": "a"},
        },
        headers=auth_headers,
    )

    sent: list[tuple[str, dict]] = []

    def fake_send(endpoint: str, p256dh: str, auth: str, payload: dict):
        sent.append((endpoint, payload))
        return True, None

    monkeypatch.setattr(push_helper, "send_push", fake_send)
    await _dispatch_due_reminders()

    assert len(sent) == 1
    endpoint, payload = sent[0]
    assert endpoint == "https://fcm.googleapis.com/fcm/send/abc"
    assert payload["task_id"] == task_id
    assert payload["title"] == "Remind me"

    # Second dispatch should NOT re-send (sent_at was marked).
    sent.clear()
    await _dispatch_due_reminders()
    assert sent == []


async def test_dispatch_evicts_dead_subscription(
    client: AsyncClient,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task_id = await _make_task(client, auth_headers)
    past = (datetime.utcnow() - timedelta(minutes=1)).isoformat()
    await client.post(
        f"/api/tasks/{task_id}/reminders",
        json={"remind_at": past},
        headers=auth_headers,
    )
    sub_body = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/dead",
        "keys": {"p256dh": "p", "auth": "a"},
    }
    await client.post("/api/push/subscribe", json=sub_body, headers=auth_headers)

    def fake_send(endpoint: str, p256dh: str, auth: str, payload: dict):
        return False, 410  # Gone — the push service tells us to drop it

    monkeypatch.setattr(push_helper, "send_push", fake_send)
    await _dispatch_due_reminders()

    # The 410 response should have evicted the subscription.
    drop = await client.post(
        "/api/push/unsubscribe", json=sub_body, headers=auth_headers
    )
    assert drop.status_code == 404


async def test_future_reminder_not_dispatched(
    client: AsyncClient,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    task_id = await _make_task(client, auth_headers)
    future = (datetime.utcnow() + timedelta(hours=1)).isoformat()
    await client.post(
        f"/api/tasks/{task_id}/reminders",
        json={"remind_at": future},
        headers=auth_headers,
    )
    await client.post(
        "/api/push/subscribe",
        json={
            "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
            "keys": {"p256dh": "p", "auth": "a"},
        },
        headers=auth_headers,
    )

    sent: list = []
    monkeypatch.setattr(
        push_helper, "send_push", lambda *a, **kw: (sent.append(a), (True, None))[1]
    )
    await _dispatch_due_reminders()
    assert sent == []
