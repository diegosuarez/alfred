from httpx import AsyncClient


async def test_register_creates_user(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "longenough"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "bob@example.com"
    assert "id" in body


async def test_register_rejects_duplicate_email(client: AsyncClient) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": "dup@example.com", "password": "longenough"},
    )
    resp = await client.post(
        "/api/auth/register",
        json={"email": "dup@example.com", "password": "longenough"},
    )
    assert resp.status_code == 400


async def test_register_rejects_short_password(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/register",
        json={"email": "short@example.com", "password": "abc"},
    )
    assert resp.status_code == 422


async def test_register_rejects_invalid_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "password": "longenough"},
    )
    assert resp.status_code == 422


async def test_login_returns_token(client: AsyncClient) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": "carol@example.com", "password": "longenough"},
    )
    resp = await client.post(
        "/api/auth/login",
        data={"username": "carol@example.com", "password": "longenough"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


async def test_login_wrong_password_rejected(client: AsyncClient) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": "dan@example.com", "password": "longenough"},
    )
    resp = await client.post(
        "/api/auth/login",
        data={"username": "dan@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 400


async def test_protected_endpoint_requires_token(client: AsyncClient) -> None:
    resp = await client.get("/api/boards")
    assert resp.status_code == 401
