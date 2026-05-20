from httpx import AsyncClient


async def _make_board(client: AsyncClient, headers: dict[str, str]) -> dict:
    create = await client.post("/api/boards", json={"name": "B"}, headers=headers)
    detail = await client.get(f"/api/boards/{create.json()['id']}", headers=headers)
    return detail.json()


async def test_create_task_in_column(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = await _make_board(client, auth_headers)
    column_id = board["columns"][0]["id"]

    resp = await client.post(
        f"/api/columns/{column_id}/tasks",
        json={"title": "Write tests", "priority": "high", "column_id": column_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    task = resp.json()
    assert task["title"] == "Write tests"
    assert task["priority"] == "high"
    assert task["column_id"] == column_id
    assert task["board_id"] == board["id"]
    assert task["position"] == 0


async def test_task_positions_increment(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = await _make_board(client, auth_headers)
    column_id = board["columns"][0]["id"]

    positions = []
    for title in ["A", "B", "C"]:
        resp = await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": title, "column_id": column_id},
            headers=auth_headers,
        )
        positions.append(resp.json()["position"])
    assert positions == [0, 1, 2]


async def test_move_task_between_columns(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = await _make_board(client, auth_headers)
    col_a, col_b = board["columns"][0]["id"], board["columns"][1]["id"]

    create = await client.post(
        f"/api/columns/{col_a}/tasks",
        json={"title": "Move me", "column_id": col_a},
        headers=auth_headers,
    )
    task_id = create.json()["id"]

    resp = await client.put(
        f"/api/tasks/{task_id}",
        json={"column_id": col_b},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["column_id"] == col_b


async def test_delete_task(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    board = await _make_board(client, auth_headers)
    column_id = board["columns"][0]["id"]
    create = await client.post(
        f"/api/columns/{column_id}/tasks",
        json={"title": "Gone", "column_id": column_id},
        headers=auth_headers,
    )
    task_id = create.json()["id"]

    resp = await client.delete(f"/api/tasks/{task_id}", headers=auth_headers)
    assert resp.status_code == 204

    second = await client.delete(f"/api/tasks/{task_id}", headers=auth_headers)
    assert second.status_code == 404


async def test_reorder_tasks_within_column(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = await _make_board(client, auth_headers)
    column_id = board["columns"][0]["id"]

    ids = []
    for title in ["A", "B", "C"]:
        r = await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": title, "column_id": column_id},
            headers=auth_headers,
        )
        ids.append(r.json()["id"])

    # Reverse order
    reversed_ids = list(reversed(ids))
    resp = await client.post(
        f"/api/columns/{column_id}/tasks/reorder",
        json={"task_ids": reversed_ids, "column_id": column_id},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    detail = await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    col = next(c for c in detail.json()["columns"] if c["id"] == column_id)
    assert [t["id"] for t in col["tasks"]] == reversed_ids


async def test_reorder_moves_task_from_another_column(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = await _make_board(client, auth_headers)
    col_a, col_b = board["columns"][0]["id"], board["columns"][1]["id"]

    a_ids = []
    for title in ["A1", "A2"]:
        r = await client.post(
            f"/api/columns/{col_a}/tasks",
            json={"title": title, "column_id": col_a},
            headers=auth_headers,
        )
        a_ids.append(r.json()["id"])
    b_first = await client.post(
        f"/api/columns/{col_b}/tasks",
        json={"title": "B1", "column_id": col_b},
        headers=auth_headers,
    )
    b_first_id = b_first.json()["id"]

    # Move A1 into column B at index 0; B1 trails it.
    resp = await client.post(
        f"/api/columns/{col_b}/tasks/reorder",
        json={"task_ids": [a_ids[0], b_first_id], "column_id": col_b},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    detail = await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    cols = {c["id"]: c for c in detail.json()["columns"]}
    assert [t["id"] for t in cols[col_b]["tasks"]] == [a_ids[0], b_first_id]
    assert [t["id"] for t in cols[col_a]["tasks"]] == [a_ids[1]]


async def test_reorder_rejects_mismatched_column_id(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = await _make_board(client, auth_headers)
    col_a, col_b = board["columns"][0]["id"], board["columns"][1]["id"]

    resp = await client.post(
        f"/api/columns/{col_a}/tasks/reorder",
        json={"task_ids": [], "column_id": col_b},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_reorder_rejects_foreign_task(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = await _make_board(client, auth_headers)
    col_id = board["columns"][0]["id"]

    # Foreign user creates their own task.
    await client.post(
        "/api/auth/register",
        json={"email": "stranger@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "stranger@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}
    other_board = await _make_board(client, other)
    other_col = other_board["columns"][0]["id"]
    other_task = await client.post(
        f"/api/columns/{other_col}/tasks",
        json={"title": "Foreign", "column_id": other_col},
        headers=other,
    )
    other_task_id = other_task.json()["id"]

    # Caller tries to drag the foreign task into their column.
    resp = await client.post(
        f"/api/columns/{col_id}/tasks/reorder",
        json={"task_ids": [other_task_id], "column_id": col_id},
        headers=auth_headers,
    )
    assert resp.status_code == 404
