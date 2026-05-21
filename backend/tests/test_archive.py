from httpx import AsyncClient


async def _make_board_with_column(
    client: AsyncClient, headers: dict[str, str]
) -> tuple[int, int]:
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=headers)
    ).json()
    return board["id"], detail["columns"][0]["id"]


async def test_archive_hides_task_from_board_detail(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board_id, col_id = await _make_board_with_column(client, auth_headers)
    task = (
        await client.post(
            f"/api/columns/{col_id}/tasks",
            json={"title": "Bury me"},
            headers=auth_headers,
        )
    ).json()

    archived = await client.put(
        f"/api/tasks/{task['id']}",
        json={"archived": True},
        headers=auth_headers,
    )
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None

    refreshed = (
        await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    ).json()
    assert refreshed["columns"][0]["tasks"] == []


async def test_unarchive_restores_task(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board_id, col_id = await _make_board_with_column(client, auth_headers)
    task = (
        await client.post(
            f"/api/columns/{col_id}/tasks",
            json={"title": "Reborn"},
            headers=auth_headers,
        )
    ).json()

    await client.put(
        f"/api/tasks/{task['id']}",
        json={"archived": True},
        headers=auth_headers,
    )
    restored = await client.put(
        f"/api/tasks/{task['id']}",
        json={"archived": False},
        headers=auth_headers,
    )
    assert restored.json()["archived_at"] is None

    refreshed = (
        await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    ).json()
    assert [t["title"] for t in refreshed["columns"][0]["tasks"]] == ["Reborn"]


async def test_archive_cascades_to_children(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board_id, col_id = await _make_board_with_column(client, auth_headers)
    parent = (
        await client.post(
            f"/api/columns/{col_id}/tasks",
            json={"title": "Parent"},
            headers=auth_headers,
        )
    ).json()
    await client.post(
        f"/api/tasks/{parent['id']}/subtasks",
        json={"title": "Child"},
        headers=auth_headers,
    )

    await client.put(
        f"/api/tasks/{parent['id']}",
        json={"archived": True},
        headers=auth_headers,
    )

    # Board detail no longer shows the parent OR the nested child.
    refreshed = (
        await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    ).json()
    assert refreshed["columns"][0]["tasks"] == []

    # Archive list surfaces the parent, with the (also archived) child
    # still nested under it.
    archived = (
        await client.get(
            f"/api/columns/{col_id}/archived-tasks", headers=auth_headers
        )
    ).json()
    assert [t["title"] for t in archived] == ["Parent"]
    children = archived[0]["children"]
    assert [c["title"] for c in children] == ["Child"]
    assert children[0]["archived_at"] is not None


async def test_archive_all_in_column(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board_id, col_id = await _make_board_with_column(client, auth_headers)
    for title in ["A", "B", "C"]:
        await client.post(
            f"/api/columns/{col_id}/tasks",
            json={"title": title},
            headers=auth_headers,
        )

    resp = await client.post(
        f"/api/columns/{col_id}/archive-all", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json() == {"archived": 3}

    refreshed = (
        await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    ).json()
    assert refreshed["columns"][0]["tasks"] == []

    archived = (
        await client.get(
            f"/api/columns/{col_id}/archived-tasks", headers=auth_headers
        )
    ).json()
    assert {t["title"] for t in archived} == {"A", "B", "C"}


async def test_archive_all_skips_already_archived(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    _, col_id = await _make_board_with_column(client, auth_headers)
    a = (
        await client.post(
            f"/api/columns/{col_id}/tasks",
            json={"title": "A"},
            headers=auth_headers,
        )
    ).json()
    await client.put(
        f"/api/tasks/{a['id']}", json={"archived": True}, headers=auth_headers
    )
    await client.post(
        f"/api/columns/{col_id}/tasks",
        json={"title": "B"},
        headers=auth_headers,
    )

    # Only B gets archived this round — A was already archived.
    resp = await client.post(
        f"/api/columns/{col_id}/archive-all", headers=auth_headers
    )
    assert resp.json() == {"archived": 1}


async def test_archived_endpoint_rejects_foreign_column(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    _, col_id = await _make_board_with_column(client, auth_headers)

    await client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "other@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.get(
        f"/api/columns/{col_id}/archived-tasks", headers=other
    )
    assert resp.status_code == 404

    resp2 = await client.post(
        f"/api/columns/{col_id}/archive-all", headers=other
    )
    assert resp2.status_code == 404
