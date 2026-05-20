from httpx import AsyncClient


async def _make_board(client: AsyncClient, headers: dict[str, str]) -> int:
    create = await client.post("/api/boards", json={"name": "B"}, headers=headers)
    return create.json()["id"]


async def test_create_column_appends_at_end(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board_id = await _make_board(client, auth_headers)

    resp = await client.post(
        f"/api/boards/{board_id}/columns",
        json={"name": "Bloqueado"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["position"] == 3  # 3 default columns already present


async def test_update_column(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    board_id = await _make_board(client, auth_headers)
    detail = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    col_id = detail.json()["columns"][0]["id"]

    resp = await client.put(
        f"/api/columns/{col_id}",
        json={"name": "To do"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "To do"


async def test_delete_column(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    board_id = await _make_board(client, auth_headers)
    detail = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    col_id = detail.json()["columns"][-1]["id"]

    resp = await client.delete(f"/api/columns/{col_id}", headers=auth_headers)
    assert resp.status_code == 204

    after = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    assert col_id not in [c["id"] for c in after.json()["columns"]]


async def test_reorder_columns(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    board_id = await _make_board(client, auth_headers)
    detail = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    col_ids = [c["id"] for c in detail.json()["columns"]]

    reversed_ids = list(reversed(col_ids))
    resp = await client.post(
        f"/api/boards/{board_id}/columns/reorder",
        json={"column_ids": reversed_ids},
        headers=auth_headers,
    )
    assert resp.status_code == 204

    after = await client.get(f"/api/boards/{board_id}", headers=auth_headers)
    assert [c["id"] for c in after.json()["columns"]] == reversed_ids
