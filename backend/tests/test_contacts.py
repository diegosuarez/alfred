from httpx import AsyncClient


async def _make_task(client: AsyncClient, headers: dict[str, str]) -> int:
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=headers)
    ).json()
    col_id = detail["columns"][0]["id"]
    task = (
        await client.post(
            f"/api/columns/{col_id}/tasks",
            json={"title": "T"},
            headers=headers,
        )
    ).json()
    return task["id"]


async def test_create_and_list_contacts(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    assert (await client.get("/api/contacts", headers=auth_headers)).json() == []

    resp = await client.post(
        "/api/contacts",
        json={
            "name": "Ada Lovelace",
            "email": "ada@example.com",
            "image_url": "https://example.com/ada.png",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Ada Lovelace"
    assert body["email"] == "ada@example.com"
    assert body["is_favorite"] is False


async def test_contacts_sort_favorites_first(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/contacts",
        json={"name": "Zoe", "is_favorite": False},
        headers=auth_headers,
    )
    await client.post(
        "/api/contacts",
        json={"name": "Abe", "is_favorite": True},
        headers=auth_headers,
    )
    await client.post(
        "/api/contacts",
        json={"name": "Marie", "is_favorite": True},
        headers=auth_headers,
    )

    listed = (await client.get("/api/contacts", headers=auth_headers)).json()
    assert [c["name"] for c in listed] == ["Abe", "Marie", "Zoe"]


async def test_duplicate_email_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/contacts",
        json={"name": "Ada", "email": "ada@example.com"},
        headers=auth_headers,
    )
    dup = await client.post(
        "/api/contacts",
        json={"name": "Ada 2", "email": "ada@example.com"},
        headers=auth_headers,
    )
    assert dup.status_code == 400


async def test_contacts_are_per_user(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/contacts",
        json={"name": "Mine"},
        headers=auth_headers,
    )

    await client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "other@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/api/contacts", headers=other)).json() == []


async def test_create_task_with_requester_and_assignees(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=auth_headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    col_id = detail["columns"][0]["id"]

    boss = (
        await client.post(
            "/api/contacts", json={"name": "Boss"}, headers=auth_headers
        )
    ).json()
    a = (
        await client.post(
            "/api/contacts", json={"name": "A"}, headers=auth_headers
        )
    ).json()
    b = (
        await client.post(
            "/api/contacts", json={"name": "B"}, headers=auth_headers
        )
    ).json()

    resp = await client.post(
        f"/api/columns/{col_id}/tasks",
        json={
            "title": "Delegated",
            "requester_id": boss["id"],
            "assignee_ids": [a["id"], b["id"]],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["requester"]["name"] == "Boss"
    assert {c["name"] for c in body["assignees"]} == {"A", "B"}


async def test_update_task_requester_with_zero_detaches(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    contact = (
        await client.post(
            "/api/contacts", json={"name": "Boss"}, headers=auth_headers
        )
    ).json()

    assigned = await client.put(
        f"/api/tasks/{task_id}",
        json={"requester_id": contact["id"]},
        headers=auth_headers,
    )
    assert assigned.json()["requester"]["id"] == contact["id"]

    detached = await client.put(
        f"/api/tasks/{task_id}",
        json={"requester_id": 0},
        headers=auth_headers,
    )
    assert detached.json()["requester"] is None


async def test_update_task_assignees_replace_and_clear(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    a = (await client.post("/api/contacts", json={"name": "A"}, headers=auth_headers)).json()
    b = (await client.post("/api/contacts", json={"name": "B"}, headers=auth_headers)).json()
    c = (await client.post("/api/contacts", json={"name": "C"}, headers=auth_headers)).json()

    one = await client.put(
        f"/api/tasks/{task_id}",
        json={"assignee_ids": [a["id"], b["id"]]},
        headers=auth_headers,
    )
    assert {x["name"] for x in one.json()["assignees"]} == {"A", "B"}

    two = await client.put(
        f"/api/tasks/{task_id}",
        json={"assignee_ids": [c["id"]]},
        headers=auth_headers,
    )
    assert [x["name"] for x in two.json()["assignees"]] == ["C"]

    cleared = await client.put(
        f"/api/tasks/{task_id}",
        json={"assignee_ids": []},
        headers=auth_headers,
    )
    assert cleared.json()["assignees"] == []


async def test_task_rejects_foreign_contact(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)

    await client.post(
        "/api/auth/register",
        json={"email": "intruder@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "intruder@example.com", "password": "longenough"},
    )
    intruder = {"Authorization": f"Bearer {login.json()['access_token']}"}
    foreign = (
        await client.post(
            "/api/contacts", json={"name": "Foreign"}, headers=intruder
        )
    ).json()

    resp = await client.put(
        f"/api/tasks/{task_id}",
        json={"requester_id": foreign["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_delete_contact_clears_requester_keeps_task(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    task_id = await _make_task(client, auth_headers)
    contact = (
        await client.post(
            "/api/contacts", json={"name": "Tmp"}, headers=auth_headers
        )
    ).json()
    await client.put(
        f"/api/tasks/{task_id}",
        json={
            "requester_id": contact["id"],
            "assignee_ids": [contact["id"]],
        },
        headers=auth_headers,
    )

    await client.delete(f"/api/contacts/{contact['id']}", headers=auth_headers)

    # Task survives, requester is cleared, assignees row is gone too.
    refreshed = await client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Survivor"},
        headers=auth_headers,
    )
    assert refreshed.status_code == 200
    body = refreshed.json()
    assert body["requester"] is None
    assert body["assignees"] == []


async def test_board_detail_includes_contacts(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    board = (
        await client.post("/api/boards", json={"name": "B"}, headers=auth_headers)
    ).json()
    detail = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    col_id = detail["columns"][0]["id"]
    boss = (
        await client.post(
            "/api/contacts", json={"name": "Boss"}, headers=auth_headers
        )
    ).json()
    await client.post(
        f"/api/columns/{col_id}/tasks",
        json={"title": "Has requester", "requester_id": boss["id"]},
        headers=auth_headers,
    )

    refreshed = (
        await client.get(f"/api/boards/{board['id']}", headers=auth_headers)
    ).json()
    task = refreshed["columns"][0]["tasks"][0]
    assert task["requester"]["name"] == "Boss"
    assert task["assignees"] == []
