from httpx import AsyncClient


async def _board_with_columns(
    client: AsyncClient, headers: dict[str, str], name: str, context_id: int | None = None
) -> dict:
    body: dict = {"name": name}
    if context_id is not None:
        body["context_id"] = context_id
    board = (await client.post("/api/boards", json=body, headers=headers)).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=headers)
    ).json()
    return detail


async def test_move_task_to_another_board_same_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    a = await _board_with_columns(client, auth_headers, "A")
    # B inherits the same default context as A.
    b = await _board_with_columns(client, auth_headers, "B")
    col_a = a["columns"][0]["id"]
    col_b = b["columns"][1]["id"]

    task = (
        await client.post(
            f"/api/columns/{col_a}/tasks",
            json={"title": "Move me"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.post(
        f"/api/tasks/{task['id']}/move",
        json={"board_id": b["id"], "column_id": col_b},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["board_id"] == b["id"]
    assert body["column_id"] == col_b

    # A no longer shows the task; B does.
    a_after = (await client.get(f"/api/boards/{a['id']}", headers=auth_headers)).json()
    assert a_after["columns"][0]["tasks"] == []
    b_after = (await client.get(f"/api/boards/{b['id']}", headers=auth_headers)).json()
    assert [t["title"] for t in b_after["columns"][1]["tasks"]] == ["Move me"]


async def test_move_cascades_children(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    a = await _board_with_columns(client, auth_headers, "A")
    b = await _board_with_columns(client, auth_headers, "B")
    col_a = a["columns"][0]["id"]
    col_b = b["columns"][0]["id"]

    parent = (
        await client.post(
            f"/api/columns/{col_a}/tasks",
            json={"title": "Parent"},
            headers=auth_headers,
        )
    ).json()
    await client.post(
        f"/api/tasks/{parent['id']}/subtasks",
        json={"title": "Child"},
        headers=auth_headers,
    )

    resp = await client.post(
        f"/api/tasks/{parent['id']}/move",
        json={"board_id": b["id"], "column_id": col_b},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    # Child landed on B too, nested under parent.
    b_after = (await client.get(f"/api/boards/{b['id']}", headers=auth_headers)).json()
    moved_parent = b_after["columns"][0]["tasks"][0]
    assert moved_parent["title"] == "Parent"
    assert [c["title"] for c in moved_parent["children"]] == ["Child"]
    assert moved_parent["children"][0]["board_id"] == b["id"]
    assert moved_parent["children"][0]["column_id"] == col_b


async def test_cross_context_move_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    work = (
        await client.post(
            "/api/contexts", json={"name": "Trabajo"}, headers=auth_headers
        )
    ).json()
    personal = (
        await client.post(
            "/api/contexts", json={"name": "Personal"}, headers=auth_headers
        )
    ).json()

    a = await _board_with_columns(client, auth_headers, "Work", context_id=work["id"])
    p = await _board_with_columns(client, auth_headers, "Home", context_id=personal["id"])
    col_a = a["columns"][0]["id"]
    col_p = p["columns"][0]["id"]

    task = (
        await client.post(
            f"/api/columns/{col_a}/tasks",
            json={"title": "T"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.post(
        f"/api/tasks/{task['id']}/move",
        json={"board_id": p["id"], "column_id": col_p},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "context" in resp.json()["detail"].lower()


async def test_move_to_column_not_in_target_board_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    a = await _board_with_columns(client, auth_headers, "A")
    b = await _board_with_columns(client, auth_headers, "B")
    col_a = a["columns"][0]["id"]
    foreign_col = a["columns"][1]["id"]  # belongs to A, not B

    task = (
        await client.post(
            f"/api/columns/{col_a}/tasks",
            json={"title": "T"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.post(
        f"/api/tasks/{task['id']}/move",
        json={"board_id": b["id"], "column_id": foreign_col},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_move_to_same_board_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    a = await _board_with_columns(client, auth_headers, "A")
    col_a = a["columns"][0]["id"]
    other_col = a["columns"][1]["id"]
    task = (
        await client.post(
            f"/api/columns/{col_a}/tasks",
            json={"title": "T"},
            headers=auth_headers,
        )
    ).json()

    resp = await client.post(
        f"/api/tasks/{task['id']}/move",
        json={"board_id": a["id"], "column_id": other_col},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_move_foreign_task_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    a = await _board_with_columns(client, auth_headers, "A")
    col_a = a["columns"][0]["id"]
    task = (
        await client.post(
            f"/api/columns/{col_a}/tasks",
            json={"title": "T"},
            headers=auth_headers,
        )
    ).json()

    await client.post(
        "/api/auth/register",
        json={"email": "foreign@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "foreign@example.com", "password": "longenough"},
    )
    foreign = {"Authorization": f"Bearer {login.json()['access_token']}"}
    foreign_board = await _board_with_columns(client, foreign, "F")

    resp = await client.post(
        f"/api/tasks/{task['id']}/move",
        json={
            "board_id": foreign_board["id"],
            "column_id": foreign_board["columns"][0]["id"],
        },
        headers=foreign,
    )
    assert resp.status_code == 404
