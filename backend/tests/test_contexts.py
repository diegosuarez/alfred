from httpx import AsyncClient


async def test_list_contexts_empty(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/contexts", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        "/api/contexts",
        json={"name": "Trabajo", "color": "#6366f1"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Trabajo"
    assert body["color"] == "#6366f1"
    assert "id" in body


async def test_create_context_rejects_duplicate_name(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/contexts", json={"name": "Personal"}, headers=auth_headers
    )
    dup = await client.post(
        "/api/contexts", json={"name": "Personal"}, headers=auth_headers
    )
    assert dup.status_code == 400


async def test_contexts_are_per_user(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await client.post("/api/contexts", json={"name": "Mine"}, headers=auth_headers)

    await client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "other@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.get("/api/contexts", headers=other)
    assert resp.status_code == 200
    assert resp.json() == []

    # The other user can reuse the same name — uniqueness is per-user.
    create = await client.post(
        "/api/contexts", json={"name": "Mine"}, headers=other
    )
    assert create.status_code == 200


async def test_update_context(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    created = await client.post(
        "/api/contexts", json={"name": "Old"}, headers=auth_headers
    )
    ctx_id = created.json()["id"]

    resp = await client.put(
        f"/api/contexts/{ctx_id}",
        json={"name": "New", "color": "#10b981"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"
    assert resp.json()["color"] == "#10b981"


async def test_delete_context(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await client.post("/api/contexts", json={"name": "Keep"}, headers=auth_headers)
    extra = await client.post(
        "/api/contexts", json={"name": "Drop"}, headers=auth_headers
    )
    extra_id = extra.json()["id"]

    resp = await client.delete(
        f"/api/contexts/{extra_id}", headers=auth_headers
    )
    assert resp.status_code == 204


async def test_cannot_delete_last_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/contexts", json={"name": "Only"}, headers=auth_headers
    )
    ctx_id = created.json()["id"]

    resp = await client.delete(
        f"/api/contexts/{ctx_id}", headers=auth_headers
    )
    assert resp.status_code == 400


async def test_create_board_auto_assigns_default_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    # Caller has no context yet — POST /boards must create "General" and use it.
    board_resp = await client.post(
        "/api/boards", json={"name": "Inbox"}, headers=auth_headers
    )
    assert board_resp.status_code == 200
    board = board_resp.json()
    assert board["context_id"] is not None

    ctx_list = await client.get("/api/contexts", headers=auth_headers)
    names = [c["name"] for c in ctx_list.json()]
    assert "General" in names


async def test_create_board_with_explicit_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    ctx = await client.post(
        "/api/contexts", json={"name": "Trabajo"}, headers=auth_headers
    )
    ctx_id = ctx.json()["id"]

    board = await client.post(
        "/api/boards",
        json={"name": "Sprint", "context_id": ctx_id},
        headers=auth_headers,
    )
    assert board.status_code == 200
    assert board.json()["context_id"] == ctx_id


async def test_create_board_rejects_foreign_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    # Foreign user creates a context.
    await client.post(
        "/api/auth/register",
        json={"email": "foreign@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "foreign@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}
    foreign_ctx = await client.post(
        "/api/contexts", json={"name": "Theirs"}, headers=other
    )
    foreign_id = foreign_ctx.json()["id"]

    resp = await client.post(
        "/api/boards",
        json={"name": "Sneak", "context_id": foreign_id},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_list_boards_filters_by_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    ctx_a = (await client.post("/api/contexts", json={"name": "A"}, headers=auth_headers)).json()
    ctx_b = (await client.post("/api/contexts", json={"name": "B"}, headers=auth_headers)).json()

    await client.post(
        "/api/boards",
        json={"name": "InA", "context_id": ctx_a["id"]},
        headers=auth_headers,
    )
    await client.post(
        "/api/boards",
        json={"name": "InB", "context_id": ctx_b["id"]},
        headers=auth_headers,
    )

    only_a = await client.get(
        f"/api/boards?context_id={ctx_a['id']}", headers=auth_headers
    )
    assert [b["name"] for b in only_a.json()] == ["InA"]

    all_boards = await client.get("/api/boards", headers=auth_headers)
    assert {b["name"] for b in all_boards.json()} == {"InA", "InB"}


async def test_update_board_changes_context(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    ctx_a = (await client.post("/api/contexts", json={"name": "A"}, headers=auth_headers)).json()
    ctx_b = (await client.post("/api/contexts", json={"name": "B"}, headers=auth_headers)).json()

    create = await client.post(
        "/api/boards",
        json={"name": "Movable", "context_id": ctx_a["id"]},
        headers=auth_headers,
    )
    board_id = create.json()["id"]

    resp = await client.put(
        f"/api/boards/{board_id}",
        json={"context_id": ctx_b["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["context_id"] == ctx_b["id"]
