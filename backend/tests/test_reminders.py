from httpx import AsyncClient


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
            json={"title": "T"},
            headers=headers,
        )
    ).json()
    return task["id"]


async def test_create_reminder(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    resp = await client.post(
        f"/api/tasks/{task_id}/reminders",
        json={"remind_at": "2026-06-01T09:00:00Z"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["task_id"] == task_id
    assert body["remind_at"].startswith("2026-06-01T09:00")


async def test_reminder_appears_in_task_response(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    await client.post(
        f"/api/tasks/{task_id}/reminders",
        json={"remind_at": "2026-06-01T09:00:00Z"},
        headers=auth_headers,
    )
    updated = await client.put(
        f"/api/tasks/{task_id}", json={"title": "T"}, headers=auth_headers
    )
    assert len(updated.json()["reminders"]) == 1


async def test_delete_reminder(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    rem = (
        await client.post(
            f"/api/tasks/{task_id}/reminders",
            json={"remind_at": "2026-06-01T09:00:00Z"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.delete(
        f"/api/reminders/{rem['id']}", headers=auth_headers
    )
    assert resp.status_code == 204
    assert (
        await client.delete(
            f"/api/reminders/{rem['id']}", headers=auth_headers
        )
    ).status_code == 404


async def test_pending_lists_all_user_reminders(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    t1 = await _make_task(client, auth_headers)
    t2 = await _make_task(client, auth_headers)
    await client.post(
        f"/api/tasks/{t1}/reminders",
        json={"remind_at": "2026-06-01T09:00:00Z"},
        headers=auth_headers,
    )
    await client.post(
        f"/api/tasks/{t2}/reminders",
        json={"remind_at": "2026-06-02T09:00:00Z"},
        headers=auth_headers,
    )

    pending = (
        await client.get("/api/reminders/pending", headers=auth_headers)
    ).json()
    assert len(pending) == 2
    # Ordered by remind_at ASC.
    assert pending[0]["remind_at"] < pending[1]["remind_at"]


async def test_pending_skips_archived_tasks(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    t = await _make_task(client, auth_headers)
    await client.post(
        f"/api/tasks/{t}/reminders",
        json={"remind_at": "2026-06-01T09:00:00Z"},
        headers=auth_headers,
    )
    await client.put(
        f"/api/tasks/{t}", json={"archived": True}, headers=auth_headers
    )

    pending = (
        await client.get("/api/reminders/pending", headers=auth_headers)
    ).json()
    assert pending == []


async def test_reminder_ownership(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    t = await _make_task(client, auth_headers)
    rem = (
        await client.post(
            f"/api/tasks/{t}/reminders",
            json={"remind_at": "2026-06-01T09:00:00Z"},
            headers=auth_headers,
        )
    ).json()

    await client.post(
        "/api/auth/register",
        json={"email": "intruder@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "intruder@example.com", "password": "longenough"},
    )
    intruder = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert (
        await client.post(
            f"/api/tasks/{t}/reminders",
            json={"remind_at": "2026-06-01T09:00:00Z"},
            headers=intruder,
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/reminders/{rem['id']}", headers=intruder)
    ).status_code == 404


async def test_delete_task_cascades_reminders(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    t = await _make_task(client, auth_headers)
    rem = (
        await client.post(
            f"/api/tasks/{t}/reminders",
            json={"remind_at": "2026-06-01T09:00:00Z"},
            headers=auth_headers,
        )
    ).json()
    await client.delete(f"/api/tasks/{t}", headers=auth_headers)
    assert (
        await client.delete(f"/api/reminders/{rem['id']}", headers=auth_headers)
    ).status_code == 404
