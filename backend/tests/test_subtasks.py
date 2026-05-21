"""Subtasks are now first-class Task rows linked via parent_task_id."""
from httpx import AsyncClient


async def _make_parent_task(
    client: AsyncClient, headers: dict[str, str]
) -> tuple[int, int]:
    """Returns (parent_task_id, column_id)."""
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=headers)
    ).json()
    column_id = detail["columns"][0]["id"]
    task = (
        await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": "Parent"},
            headers=headers,
        )
    ).json()
    return task["id"], column_id


async def test_create_subtask_via_convenience_route(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, _ = await _make_parent_task(client, auth_headers)
    resp = await client.post(
        f"/api/tasks/{parent_id}/subtasks",
        json={"title": "Step 1"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    child = resp.json()
    assert child["title"] == "Step 1"
    assert child["parent_task_id"] == parent_id
    assert child["completed"] is False
    # Full-fledged task: it has columns/board inherited from parent.
    assert child["column_id"] is not None
    assert child["board_id"] is not None


async def test_create_subtask_via_columns_route(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, column_id = await _make_parent_task(client, auth_headers)
    resp = await client.post(
        f"/api/columns/{column_id}/tasks",
        json={"title": "Step 1", "parent_task_id": parent_id, "priority": "high"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    child = resp.json()
    assert child["parent_task_id"] == parent_id
    assert child["priority"] == "high"


async def test_subtask_supports_full_task_fields(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, _ = await _make_parent_task(client, auth_headers)
    tag = (
        await client.post("/api/tags", json={"name": "urgent"}, headers=auth_headers)
    ).json()

    resp = await client.post(
        f"/api/tasks/{parent_id}/subtasks",
        json={
            "title": "Detailed step",
            "description": "with body",
            "priority": "high",
            "due_date": "2026-12-31T00:00:00",
            "tag_ids": [tag["id"]],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    child = resp.json()
    assert child["description"] == "with body"
    assert child["priority"] == "high"
    assert child["due_date"].startswith("2026-12-31")
    assert [t["name"] for t in child["tags"]] == ["urgent"]


async def test_toggle_completed(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, _ = await _make_parent_task(client, auth_headers)
    child = (
        await client.post(
            f"/api/tasks/{parent_id}/subtasks",
            json={"title": "Toggle"},
            headers=auth_headers,
        )
    ).json()

    done = await client.put(
        f"/api/tasks/{child['id']}",
        json={"completed": True},
        headers=auth_headers,
    )
    assert done.json()["completed"] is True

    reopened = await client.put(
        f"/api/tasks/{child['id']}",
        json={"completed": False},
        headers=auth_headers,
    )
    assert reopened.json()["completed"] is False


async def test_delete_subtask_via_tasks_route(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, _ = await _make_parent_task(client, auth_headers)
    child = (
        await client.post(
            f"/api/tasks/{parent_id}/subtasks",
            json={"title": "Gone"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.delete(f"/api/tasks/{child['id']}", headers=auth_headers)
    assert resp.status_code == 204
    assert (
        await client.delete(f"/api/tasks/{child['id']}", headers=auth_headers)
    ).status_code == 404


async def test_board_detail_nests_children_under_parent(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=auth_headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    column_id = detail["columns"][0]["id"]

    parent = (
        await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": "Parent"},
            headers=auth_headers,
        )
    ).json()
    await client.post(
        f"/api/tasks/{parent['id']}/subtasks",
        json={"title": "Child A"},
        headers=auth_headers,
    )
    await client.post(
        f"/api/tasks/{parent['id']}/subtasks",
        json={"title": "Child B"},
        headers=auth_headers,
    )

    refreshed = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    column = refreshed["columns"][0]
    # Top-level list has only the parent — children are nested, not flat.
    assert [t["title"] for t in column["tasks"]] == ["Parent"]
    titles = [c["title"] for c in column["tasks"][0]["children"]]
    assert titles == ["Child A", "Child B"]


async def test_children_survive_a_second_board_fetch(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """Regression: a previous implementation mutated Column.tasks in
    place to filter out children, which silently orphan-deleted them
    on session commit. Fetching twice now must keep the children."""
    parent_id, _ = await _make_parent_task(client, auth_headers)
    await client.post(
        f"/api/tasks/{parent_id}/subtasks",
        json={"title": "Persist me"},
        headers=auth_headers,
    )
    # First fetch — the bug used to serve the right shape and then
    # delete the rows on the way out.
    first = await client.get(
        f"/api/boards/1", headers=auth_headers
    )
    # The board id depends on context_id, so look up via the API:
    boards = (await client.get("/api/boards", headers=auth_headers)).json()
    board_id = next(b["id"] for b in boards if b["name"] == "B")
    first = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    assert [
        c["title"]
        for c in first.json()["columns"][0]["tasks"][0]["children"]
    ] == ["Persist me"]
    second = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    assert [
        c["title"]
        for c in second.json()["columns"][0]["tasks"][0]["children"]
    ] == ["Persist me"]


async def test_delete_parent_cascades_to_children(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, _ = await _make_parent_task(client, auth_headers)
    child = (
        await client.post(
            f"/api/tasks/{parent_id}/subtasks",
            json={"title": "Doomed"},
            headers=auth_headers,
        )
    ).json()
    await client.delete(f"/api/tasks/{parent_id}", headers=auth_headers)

    assert (
        await client.put(
            f"/api/tasks/{child['id']}",
            json={"title": "still here?"},
            headers=auth_headers,
        )
    ).status_code == 404


async def test_subtask_ownership_enforced(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, _ = await _make_parent_task(client, auth_headers)

    await client.post(
        "/api/auth/register",
        json={"email": "stranger@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "stranger@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert (
        await client.post(
            f"/api/tasks/{parent_id}/subtasks",
            json={"title": "sneaky"},
            headers=other,
        )
    ).status_code == 404


async def test_promote_task_to_subtask_via_update(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """Setting parent_task_id on an existing task turns it into a child."""
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=auth_headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    column_id = detail["columns"][0]["id"]

    a = (
        await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": "A"},
            headers=auth_headers,
        )
    ).json()
    b = (
        await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": "B"},
            headers=auth_headers,
        )
    ).json()

    nested = await client.put(
        f"/api/tasks/{b['id']}",
        json={"parent_task_id": a["id"]},
        headers=auth_headers,
    )
    assert nested.json()["parent_task_id"] == a["id"]

    # Detach via sentinel 0
    detached = await client.put(
        f"/api/tasks/{b['id']}",
        json={"parent_task_id": 0},
        headers=auth_headers,
    )
    assert detached.json()["parent_task_id"] is None


async def test_cannot_parent_to_self(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    parent_id, _ = await _make_parent_task(client, auth_headers)
    resp = await client.put(
        f"/api/tasks/{parent_id}",
        json={"parent_task_id": parent_id},
        headers=auth_headers,
    )
    assert resp.status_code == 400
