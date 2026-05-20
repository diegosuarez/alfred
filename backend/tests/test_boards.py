from httpx import AsyncClient


async def test_create_board_seeds_default_columns(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        "/api/boards",
        json={"name": "Work", "description": "Day job"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    board = resp.json()
    board_id = board["id"]

    detail = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert [c["name"] for c in body["columns"]] == ["Pendiente", "En Proceso", "Completado"]
    assert [c["position"] for c in body["columns"]] == [0, 1, 2]


async def test_list_boards_only_returns_caller_owned(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post("/api/boards", json={"name": "Mine"}, headers=auth_headers)

    # Second user must not see the first user's board.
    await client.post(
        "/api/auth/register",
        json={"email": "eve@example.com", "password": "longenough"},
    )
    other_login = await client.post(
        "/api/auth/login",
        data={"username": "eve@example.com", "password": "longenough"},
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}

    resp = await client.get("/api/boards", headers=other_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_update_board(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/boards", json={"name": "Old"}, headers=auth_headers)
    board_id = create.json()["id"]

    resp = await client.put(
        f"/api/boards/{board_id}",
        json={"name": "New", "description": "Renamed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"
    assert resp.json()["description"] == "Renamed"


async def test_delete_board(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/boards", json={"name": "Doomed"}, headers=auth_headers)
    board_id = create.json()["id"]

    resp = await client.delete(f"/api/boards/{board_id}", headers=auth_headers)
    assert resp.status_code == 204

    follow_up = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    assert follow_up.status_code == 404


async def test_cannot_access_other_users_board(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post("/api/boards", json={"name": "Private"}, headers=auth_headers)
    board_id = created.json()["id"]

    await client.post(
        "/api/auth/register",
        json={"email": "mallory@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "mallory@example.com", "password": "longenough"},
    )
    intruder = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert (await client.get(f"/api/boards/{board_id}", headers=intruder)).status_code == 404
    assert (
        await client.put(f"/api/boards/{board_id}", json={"name": "X"}, headers=intruder)
    ).status_code == 404
    assert (await client.delete(f"/api/boards/{board_id}", headers=intruder)).status_code == 404
