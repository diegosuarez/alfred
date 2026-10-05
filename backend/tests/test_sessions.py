from datetime import timedelta
from urllib.parse import parse_qs, unquote, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.core import google_oauth
from app.core.config import settings
from app.core.sessions import REFRESH_COOKIE
from app.core.time import utcnow
from app.models.user_session import UserSession

EMAIL = "alice@example.com"
PASSWORD = "supersecret"


async def _login(client: AsyncClient, remember: bool, email: str = EMAIL) -> str:
    await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    resp = await client.post(
        "/api/auth/login",
        data={"username": email, "password": PASSWORD, "remember": str(remember).lower()},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_login_without_remember_sets_no_refresh_cookie(client: AsyncClient):
    await _login(client, remember=False)

    assert REFRESH_COOKIE not in client.cookies
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401


async def test_remember_cookie_is_httponly_and_scoped(client: AsyncClient):
    await client.post("/api/auth/register", json={"email": EMAIL, "password": PASSWORD})
    resp = await client.post(
        "/api/auth/login",
        data={"username": EMAIL, "password": PASSWORD, "remember": "true"},
    )

    set_cookie = resp.headers["set-cookie"].lower()
    assert set_cookie.startswith(f"{REFRESH_COOKIE}=")
    assert "httponly" in set_cookie
    assert "path=/api/auth" in set_cookie
    assert "samesite=lax" in set_cookie
    assert f"max-age={90 * 24 * 3600}" in set_cookie


async def test_refresh_issues_working_token_and_slides_expiry(
    client: AsyncClient, db_engine
):
    await _login(client, remember=True)
    async with db_engine.begin() as conn:
        # Pretend the session was last used a month ago.
        await conn.execute(
            update(UserSession).values(
                expires_at=utcnow().replace(tzinfo=None) + timedelta(days=60)
            )
        )

    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    assert (await client.get("/api/boards", headers=_bearer(token))).status_code == 200

    sessions = (await client.get("/api/auth/sessions", headers=_bearer(token))).json()
    assert len(sessions) == 1
    assert sessions[0]["current"] is True
    # Slid back to ~90 days out.
    assert sessions[0]["expires_at"] > (utcnow() + timedelta(days=89)).isoformat()


async def test_expired_session_cannot_refresh(client: AsyncClient, db_engine):
    await _login(client, remember=True)
    async with db_engine.begin() as conn:
        await conn.execute(
            update(UserSession).values(
                expires_at=utcnow().replace(tzinfo=None) - timedelta(seconds=1)
            )
        )

    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401
    assert REFRESH_COOKIE not in client.cookies


async def test_logout_revokes_session_and_its_tokens(client: AsyncClient):
    token = await _login(client, remember=True)

    resp = await client.post("/api/auth/logout")
    assert resp.status_code == 204
    assert REFRESH_COOKIE not in client.cookies
    # The JWT carries the session id, so it dies with the session.
    assert (await client.get("/api/boards", headers=_bearer(token))).status_code == 401


async def test_revoking_another_device_cuts_it_off(client: AsyncClient):
    phone_token = await _login(client, remember=True)
    phone_cookie = client.cookies[REFRESH_COOKIE]
    client.cookies.clear()
    laptop_token = await _login(client, remember=True)

    sessions = (
        await client.get("/api/auth/sessions", headers=_bearer(laptop_token))
    ).json()
    assert len(sessions) == 2
    phone = next(s for s in sessions if not s["current"])

    resp = await client.delete(
        f"/api/auth/sessions/{phone['id']}", headers=_bearer(laptop_token)
    )
    assert resp.status_code == 204
    assert (await client.get("/api/boards", headers=_bearer(phone_token))).status_code == 401
    assert (await client.get("/api/boards", headers=_bearer(laptop_token))).status_code == 200

    client.cookies.clear()
    client.cookies.set(REFRESH_COOKIE, phone_cookie, path="/api/auth")
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_cannot_revoke_someone_elses_session(client: AsyncClient):
    await _login(client, remember=True)
    alice_session = (
        await client.get(
            "/api/auth/sessions",
            headers=_bearer((await client.post("/api/auth/refresh")).json()["access_token"]),
        )
    ).json()[0]
    client.cookies.clear()
    bob_token = await _login(client, remember=False, email="bob@example.com")

    resp = await client.delete(
        f"/api/auth/sessions/{alice_session['id']}", headers=_bearer(bob_token)
    )
    assert resp.status_code == 404


async def test_sessions_require_auth(client: AsyncClient):
    assert (await client.get("/api/auth/sessions")).status_code == 401


async def test_google_login_with_remember_opens_session(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret")

    async def fake_exchange(code: str, redirect_uri: str) -> dict:
        return {"access_token": "fake-access", "expires_in": 3600}

    async def fake_userinfo(access_token: str) -> dict:
        return {"email": "carol@example.com", "sub": "google-sub-carol"}

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", fake_exchange)
    monkeypatch.setattr(google_oauth, "fetch_userinfo", fake_userinfo)

    init = await client.get(
        "/api/auth/google/login?remember=true", follow_redirects=False
    )
    state = unquote(parse_qs(urlparse(init.headers["location"]).query)["state"][0])
    resp = await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )

    assert resp.status_code in (302, 307)
    assert REFRESH_COOKIE in client.cookies
    token = parse_qs(urlparse(resp.headers["location"]).query)["token"][0]
    sessions = (await client.get("/api/auth/sessions", headers=_bearer(token))).json()
    assert [s["current"] for s in sessions] == [True]
