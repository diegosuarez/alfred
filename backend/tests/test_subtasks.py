from httpx import AsyncClient


async def _make_task(client: AsyncClient, headers: dict[str, str]) -> int:
    board = (await client.post("/api/boards", json={"name": "B"}, headers=headers)).json()
    detail = (await client.get(f"/api/boards/{board['id']}", headers=headers)).json()
    column_id = detail["columns"][0]["id"]
    task = (
        await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": "Parent", "column_id": column_id},
            headers=headers,
        )
    ).json()
    return task["id"]


async def test_create_subtask(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    resp = await client.post(
        f"/api/tasks/{task_id}/subtasks",
        json={"title": "Step 1"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Step 1"
    assert body["completed"] is False
    assert body["position"] == 0
    assert body["task_id"] == task_id


async def test_subtask_positions_increment(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    positions = []
    for title in ["A", "B", "C"]:
        r = await client.post(
            f"/api/tasks/{task_id}/subtasks",
            json={"title": title},
            headers=auth_headers,
        )
        positions.append(r.json()["position"])
    assert positions == [0, 1, 2]


async def test_toggle_subtask_completed(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    sub = (
        await client.post(
            f"/api/tasks/{task_id}/subtasks",
            json={"title": "Toggle"},
            headers=auth_headers,
        )
    ).json()

    done = await client.put(
        f"/api/subtasks/{sub['id']}",
        json={"completed": True},
        headers=auth_headers,
    )
    assert done.json()["completed"] is True

    reopen = await client.put(
        f"/api/subtasks/{sub['id']}",
        json={"completed": False},
        headers=auth_headers,
    )
    assert reopen.json()["completed"] is False


async def test_delete_subtask(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    sub = (
        await client.post(
            f"/api/tasks/{task_id}/subtasks",
            json={"title": "Gone"},
            headers=auth_headers,
        )
    ).json()
    resp = await client.delete(f"/api/subtasks/{sub['id']}", headers=auth_headers)
    assert resp.status_code == 204
    second = await client.delete(f"/api/subtasks/{sub['id']}", headers=auth_headers)
    assert second.status_code == 404


async def test_task_response_includes_subtasks(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    await client.post(
        f"/api/tasks/{task_id}/subtasks",
        json={"title": "S1"},
        headers=auth_headers,
    )

    updated = await client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Parent (renamed)"},
        headers=auth_headers,
    )
    assert [s["title"] for s in updated.json()["subtasks"]] == ["S1"]


async def test_board_detail_includes_subtasks(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=auth_headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    column_id = detail["columns"][0]["id"]
    task = (
        await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": "Parent", "column_id": column_id},
            headers=auth_headers,
        )
    ).json()
    await client.post(
        f"/api/tasks/{task['id']}/subtasks",
        json={"title": "S1"},
        headers=auth_headers,
    )

    refreshed = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    parent = refreshed["columns"][0]["tasks"][0]
    assert [s["title"] for s in parent["subtasks"]] == ["S1"]


async def test_subtask_ownership_is_enforced(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    sub = (
        await client.post(
            f"/api/tasks/{task_id}/subtasks",
            json={"title": "Mine"},
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
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # Foreign user cannot list/update/delete the subtask via either endpoint.
    assert (
        await client.put(
            f"/api/subtasks/{sub['id']}",
            json={"title": "hacked"},
            headers=other,
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/subtasks/{sub['id']}", headers=other)
    ).status_code == 404
    assert (
        await client.post(
            f"/api/tasks/{task_id}/subtasks",
            json={"title": "X"},
            headers=other,
        )
    ).status_code == 404


async def test_delete_task_cascades_subtasks(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    sub = (
        await client.post(
            f"/api/tasks/{task_id}/subtasks",
            json={"title": "Doomed"},
            headers=auth_headers,
        )
    ).json()
    await client.delete(f"/api/tasks/{task_id}", headers=auth_headers)
    # Subtask should be gone too — best signal is that updating it 404s.
    assert (
        await client.put(
            f"/api/subtasks/{sub['id']}",
            json={"title": "Z"},
            headers=auth_headers,
        )
    ).status_code == 404
