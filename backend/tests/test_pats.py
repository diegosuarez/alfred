from httpx import AsyncClient


async def test_create_pat_returns_token_once(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        "/api/pats", json={"name": "macbook cli"}, headers=auth_headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "macbook cli"
    assert body["token"].startswith("alfred_pat_")
    assert body["revoked_at"] is None
    assert body["prefix"] in body["token"]

    # Listing must NOT expose the secret.
    listed = await client.get("/api/pats", headers=auth_headers)
    items = listed.json()
    assert len(items) == 1
    assert "token" not in items[0]


async def test_pat_authenticates_subsequent_requests(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/pats", json={"name": "cli"}, headers=auth_headers
    )
    token = created.json()["token"]

    pat_headers = {"Authorization": f"Bearer {token}"}
    # A PAT should be enough to hit any authenticated endpoint.
    resp = await client.get("/api/boards", headers=pat_headers)
    assert resp.status_code == 200


async def test_revoked_pat_is_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/pats", json={"name": "throwaway"}, headers=auth_headers
    )
    token = created.json()["token"]
    pat_id = created.json()["id"]

    revoke = await client.delete(f"/api/pats/{pat_id}", headers=auth_headers)
    assert revoke.status_code == 204

    pat_headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/api/boards", headers=pat_headers)
    assert resp.status_code == 401


async def test_invalid_pat_rejected(client: AsyncClient) -> None:
    bogus = {"Authorization": "Bearer alfred_pat_not-a-real-token"}
    resp = await client.get("/api/boards", headers=bogus)
    assert resp.status_code == 401


async def test_pat_last_used_at_updates(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/pats", json={"name": "cli"}, headers=auth_headers
    )
    pat_id = created.json()["id"]
    token = created.json()["token"]
    assert created.json()["last_used_at"] is None

    # Use the PAT.
    pat_headers = {"Authorization": f"Bearer {token}"}
    await client.get("/api/boards", headers=pat_headers)

    listed = await client.get("/api/pats", headers=auth_headers)
    after = next(p for p in listed.json() if p["id"] == pat_id)
    assert after["last_used_at"] is not None


async def test_pat_isolated_between_users(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/pats", json={"name": "alice cli"}, headers=auth_headers
    )
    pat_id = created.json()["id"]

    await client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "bob@example.com", "password": "longenough"},
    )
    bob_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # Bob can't see Alice's PATs.
    listed = await client.get("/api/pats", headers=bob_headers)
    assert listed.json() == []

    # Bob can't revoke Alice's PAT.
    resp = await client.delete(f"/api/pats/{pat_id}", headers=bob_headers)
    assert resp.status_code == 404


async def test_pat_with_expired_date_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    # Past-dated expires_at: token should be born already expired.
    created = await client.post(
        "/api/pats",
        json={"name": "stale", "expires_at": "2000-01-01T00:00:00Z"},
        headers=auth_headers,
    )
    token = created.json()["token"]

    pat_headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/api/boards", headers=pat_headers)
    assert resp.status_code == 401


async def test_jwt_still_works_alongside_pats(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    # Sanity: JWT bearer keeps functioning after the PAT branch was added.
    resp = await client.get("/api/boards", headers=auth_headers)
    assert resp.status_code == 200
