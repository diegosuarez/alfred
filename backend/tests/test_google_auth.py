import pytest
from httpx import AsyncClient

from app.core import google_oauth
from app.core.config import settings


@pytest.fixture
def google_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pretend Google credentials are configured for the duration of a test.
    The mock client below short-circuits the actual network calls.
    """
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret")


@pytest.fixture
def mock_google_user(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Patch the two network-bound functions to return a fixed identity."""
    identity = {
        "email": "diego@example.com",
        "sub": "google-sub-12345",
        "name": "Diego Test",
    }

    async def fake_exchange(code: str, redirect_uri: str) -> dict:
        assert code == "fake-code"
        return {
            "access_token": "fake-access",
            "refresh_token": "fake-refresh",
            "expires_in": 3600,
            "scope": "openid email profile",
            "token_type": "Bearer",
        }

    async def fake_userinfo(access_token: str) -> dict:
        assert access_token == "fake-access"
        return identity

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", fake_exchange)
    monkeypatch.setattr(google_oauth, "fetch_userinfo", fake_userinfo)
    return identity


async def test_google_login_redirects_to_google(
    client: AsyncClient, google_creds: None
) -> None:
    resp = await client.get("/api/auth/google/login", follow_redirects=False)
    assert resp.status_code == 307 or resp.status_code == 302
    assert resp.headers["location"].startswith(
        "https://accounts.google.com/o/oauth2/v2/auth"
    )
    assert "alfred_oauth_state=" in resp.headers.get("set-cookie", "")


async def test_google_login_returns_503_when_not_configured(
    client: AsyncClient,
) -> None:
    resp = await client.get("/api/auth/google/login", follow_redirects=False)
    assert resp.status_code == 503


async def test_google_callback_creates_user_and_redirects(
    client: AsyncClient, google_creds: None, mock_google_user: dict
) -> None:
    # First hit /login to obtain a signed state cookie.
    init = await client.get("/api/auth/google/login", follow_redirects=False)
    assert init.status_code in (302, 307)
    # httpx stores the cookie on the client automatically.
    # Extract the state value from the Location header.
    location = init.headers["location"]
    state = location.split("state=")[1].split("&")[0]

    resp = await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    target = resp.headers["location"]
    assert target.startswith(settings.FRONTEND_URL)
    assert "token=" in target


async def test_google_callback_links_existing_user_by_email(
    client: AsyncClient, google_creds: None, mock_google_user: dict
) -> None:
    # Pre-register the same email locally.
    await client.post(
        "/api/auth/register",
        json={"email": mock_google_user["email"], "password": "longenough"},
    )

    init = await client.get("/api/auth/google/login", follow_redirects=False)
    state = init.headers["location"].split("state=")[1].split("&")[0]

    resp = await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    # Token issued for the existing user (email/password still works in parallel).
    login = await client.post(
        "/api/auth/login",
        data={"username": mock_google_user["email"], "password": "longenough"},
    )
    assert login.status_code == 200


async def test_google_callback_rejects_bad_state(
    client: AsyncClient, google_creds: None, mock_google_user: dict
) -> None:
    # Initiate to set a cookie, but then submit a different state on the callback.
    await client.get("/api/auth/google/login", follow_redirects=False)

    resp = await client.get(
        "/api/auth/google/callback?code=fake-code&state=forged-state",
        follow_redirects=False,
    )
    assert resp.status_code == 400


async def test_google_callback_propagates_provider_error(
    client: AsyncClient, google_creds: None
) -> None:
    resp = await client.get(
        "/api/auth/google/callback?error=access_denied",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert "oauth_error=access_denied" in resp.headers["location"]
