from httpx import AsyncClient


async def _make_board_with_column(
    client: AsyncClient, headers: dict[str, str]
) -> tuple[int, int]:
    create = await client.post("/api/boards", json={"name": "B"}, headers=headers)
    detail = await client.get(f"/api/boards/{create.json()['id']}", headers=headers)
    body = detail.json()
    return body["id"], body["columns"][0]["id"]


async def test_create_and_list_tags(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    assert (await client.get("/api/tags", headers=auth_headers)).json() == []

    resp = await client.post(
        "/api/tags",
        json={"name": "urgente", "color": "#ef4444"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "urgente"
    assert body["color"] == "#ef4444"

    listed = await client.get("/api/tags", headers=auth_headers)
    assert [t["name"] for t in listed.json()] == ["urgente"]


async def test_tag_name_unique_per_user(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/tags", json={"name": "dup"}, headers=auth_headers
    )
    dup = await client.post(
        "/api/tags", json={"name": "dup"}, headers=auth_headers
    )
    assert dup.status_code == 400

    # Another user can reuse the same name.
    await client.post(
        "/api/auth/register",
        json={"email": "ann@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "ann@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}
    ok = await client.post("/api/tags", json={"name": "dup"}, headers=other)
    assert ok.status_code == 200


async def test_update_and_delete_tag(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/tags", json={"name": "old"}, headers=auth_headers
    )
    tag_id = created.json()["id"]

    updated = await client.put(
        f"/api/tags/{tag_id}",
        json={"name": "new", "color": "#10b981"},
        headers=auth_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "new"
    assert updated.json()["color"] == "#10b981"

    deleted = await client.delete(f"/api/tags/{tag_id}", headers=auth_headers)
    assert deleted.status_code == 204
    assert (await client.get("/api/tags", headers=auth_headers)).json() == []


async def test_create_task_attaches_tags(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    _, column_id = await _make_board_with_column(client, auth_headers)
    a = (await client.post("/api/tags", json={"name": "a"}, headers=auth_headers)).json()
    b = (await client.post("/api/tags", json={"name": "b"}, headers=auth_headers)).json()

    resp = await client.post(
        f"/api/columns/{column_id}/tasks",
        json={"title": "Tagged", "column_id": column_id, "tag_ids": [a["id"], b["id"]]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    tag_names = {t["name"] for t in resp.json()["tags"]}
    assert tag_names == {"a", "b"}


async def test_update_task_replaces_tags(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    _, column_id = await _make_board_with_column(client, auth_headers)
    a = (await client.post("/api/tags", json={"name": "a"}, headers=auth_headers)).json()
    b = (await client.post("/api/tags", json={"name": "b"}, headers=auth_headers)).json()
    c = (await client.post("/api/tags", json={"name": "c"}, headers=auth_headers)).json()

    create = await client.post(
        f"/api/columns/{column_id}/tasks",
        json={"title": "T", "column_id": column_id, "tag_ids": [a["id"], b["id"]]},
        headers=auth_headers,
    )
    task_id = create.json()["id"]

    updated = await client.put(
        f"/api/tasks/{task_id}",
        json={"tag_ids": [c["id"]]},
        headers=auth_headers,
    )
    assert {t["name"] for t in updated.json()["tags"]} == {"c"}

    # Clearing — empty list means "no tags".
    cleared = await client.put(
        f"/api/tasks/{task_id}",
        json={"tag_ids": []},
        headers=auth_headers,
    )
    assert cleared.json()["tags"] == []


async def test_create_task_rejects_foreign_tag(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    _, column_id = await _make_board_with_column(client, auth_headers)

    await client.post(
        "/api/auth/register",
        json={"email": "stranger@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "stranger@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}
    foreign = (
        await client.post("/api/tags", json={"name": "spy"}, headers=other)
    ).json()

    resp = await client.post(
        f"/api/columns/{column_id}/tasks",
        json={"title": "T", "column_id": column_id, "tag_ids": [foreign["id"]]},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_board_detail_includes_tags(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board_id, column_id = await _make_board_with_column(client, auth_headers)
    tag = (await client.post("/api/tags", json={"name": "x"}, headers=auth_headers)).json()
    await client.post(
        f"/api/columns/{column_id}/tasks",
        json={"title": "Tagged", "column_id": column_id, "tag_ids": [tag["id"]]},
        headers=auth_headers,
    )

    detail = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    columns = detail.json()["columns"]
    task = columns[0]["tasks"][0]
    assert [t["name"] for t in task["tags"]] == ["x"]


async def test_delete_tag_detaches_from_tasks(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    _, column_id = await _make_board_with_column(client, auth_headers)
    tag = (await client.post("/api/tags", json={"name": "gone"}, headers=auth_headers)).json()
    task = (
        await client.post(
            f"/api/columns/{column_id}/tasks",
            json={"title": "T", "column_id": column_id, "tag_ids": [tag["id"]]},
            headers=auth_headers,
        )
    ).json()

    await client.delete(f"/api/tags/{tag['id']}", headers=auth_headers)

    # Re-fetch the task and confirm the join row is gone.
    refreshed = await client.put(
        f"/api/tasks/{task['id']}",
        json={"title": "T"},
        headers=auth_headers,
    )
    assert refreshed.json()["tags"] == []
