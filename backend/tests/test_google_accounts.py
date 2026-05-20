import pytest
from httpx import AsyncClient

from app.core import google_oauth
from app.core.config import settings


@pytest.fixture
def google_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret")


@pytest.fixture
def mock_google_user(monkeypatch: pytest.MonkeyPatch) -> dict:
    identity = {"email": "extra@example.com", "sub": "extra-google-sub"}

    async def fake_exchange(code: str, redirect_uri: str) -> dict:
        return {
            "access_token": "fake-access",
            "refresh_token": "fake-refresh",
            "expires_in": 3600,
            "scope": "openid email profile https://www.googleapis.com/auth/calendar.readonly",
        }

    async def fake_userinfo(access_token: str) -> dict:
        return identity

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", fake_exchange)
    monkeypatch.setattr(google_oauth, "fetch_userinfo", fake_userinfo)
    return identity


async def test_list_google_accounts_empty(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/google-accounts", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_connect_returns_authorize_url_and_sets_cookie(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
) -> None:
    resp = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": ["https://www.googleapis.com/auth/calendar.readonly"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["authorize_url"].startswith(
        "https://accounts.google.com/o/oauth2/v2/auth"
    )
    assert "scope=openid+email+profile" in body["authorize_url"]
    assert "calendar.readonly" in body["authorize_url"]
    assert "alfred_oauth_state=" in resp.headers.get("set-cookie", "")


async def test_callback_in_connect_mode_attaches_to_current_user(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_google_user: dict,
) -> None:
    init = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": []},
        headers=auth_headers,
    )
    state = init.json()["authorize_url"].split("state=")[1].split("&")[0]

    resp = await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    # The connect-mode redirect lands back on the SPA with a flag, no token.
    assert "google_connected=1" in resp.headers["location"]
    assert "token=" not in resp.headers["location"]

    listed = await client.get("/api/google-accounts", headers=auth_headers)
    accounts = listed.json()
    assert len(accounts) == 1
    assert accounts[0]["email"] == mock_google_user["email"]
    assert "calendar.readonly" in accounts[0]["scopes"]


async def test_disconnect_google_account(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_google_user: dict,
) -> None:
    init = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": []},
        headers=auth_headers,
    )
    state = init.json()["authorize_url"].split("state=")[1].split("&")[0]
    await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )

    accounts = (await client.get("/api/google-accounts", headers=auth_headers)).json()
    account_id = accounts[0]["id"]

    resp = await client.delete(
        f"/api/google-accounts/{account_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    remaining = await client.get("/api/google-accounts", headers=auth_headers)
    assert remaining.json() == []


async def test_cannot_disconnect_other_users_account(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_google_user: dict,
) -> None:
    init = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": []},
        headers=auth_headers,
    )
    state = init.json()["authorize_url"].split("state=")[1].split("&")[0]
    await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    account_id = (await client.get("/api/google-accounts", headers=auth_headers)).json()[0]["id"]

    await client.post(
        "/api/auth/register",
        json={"email": "intruder@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "intruder@example.com", "password": "longenough"},
    )
    intruder = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.delete(
        f"/api/google-accounts/{account_id}", headers=intruder
    )
    assert resp.status_code == 404


async def test_assign_google_account_to_context(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_google_user: dict,
) -> None:
    init = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": []},
        headers=auth_headers,
    )
    state = init.json()["authorize_url"].split("state=")[1].split("&")[0]
    await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    account_id = (await client.get("/api/google-accounts", headers=auth_headers)).json()[0]["id"]

    ctx = (
        await client.post(
            "/api/contexts", json={"name": "Trabajo"}, headers=auth_headers
        )
    ).json()

    resp = await client.put(
        f"/api/contexts/{ctx['id']}",
        json={"google_account_id": account_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["google_account_id"] == account_id

    # Detach via the 0 sentinel.
    cleared = await client.put(
        f"/api/contexts/{ctx['id']}",
        json={"google_account_id": 0},
        headers=auth_headers,
    )
    assert cleared.status_code == 200
    assert cleared.json()["google_account_id"] is None


async def test_assign_rejects_foreign_google_account(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    ctx = (
        await client.post(
            "/api/contexts", json={"name": "Trabajo"}, headers=auth_headers
        )
    ).json()

    resp = await client.put(
        f"/api/contexts/{ctx['id']}",
        json={"google_account_id": 99999},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_connect_returns_503_when_not_configured(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": []},
        headers=auth_headers,
    )
    assert resp.status_code == 503
