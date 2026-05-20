from httpx import AsyncClient


async def _create_task(client: AsyncClient, headers: dict[str, str]) -> int:
    board_resp = await client.post("/api/boards", json={"name": "B"}, headers=headers)
    detail = await client.get(f"/api/boards/{board_resp.json()['id']}", headers=headers)
    col_id = detail.json()["columns"][0]["id"]
    task_resp = await client.post(
        f"/api/columns/{col_id}/tasks",
        json={"title": "Focus task", "column_id": col_id},
        headers=headers,
    )
    return task_resp.json()["id"]


async def test_create_focus_session(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    task_id = await _create_task(client, auth_headers)

    resp = await client.post(
        "/api/focus",
        json={"task_id": task_id, "duration": 1500},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["task_id"] == task_id
    assert body["duration"] == 1500


async def test_focus_stats_empty_returns_seven_days(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/focus/stats", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_focus_time"] == 0
    assert body["sessions_completed"] == 0
    assert len(body["daily_stats"]) == 7


async def test_focus_stats_aggregates_sessions(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _create_task(client, auth_headers)
    for duration in (1500, 600, 1500):
        await client.post(
            "/api/focus",
            json={"task_id": task_id, "duration": duration},
            headers=auth_headers,
        )

    stats = await client.get("/api/focus/stats", headers=auth_headers)
    body = stats.json()
    assert body["total_focus_time"] == 3600
    assert body["sessions_completed"] == 3


async def test_focus_session_rejects_foreign_task(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _create_task(client, auth_headers)

    await client.post(
        "/api/auth/register",
        json={"email": "trent@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "trent@example.com", "password": "longenough"},
    )
    intruder = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.post(
        "/api/focus",
        json={"task_id": task_id, "duration": 1500},
        headers=intruder,
    )
    assert resp.status_code == 404
