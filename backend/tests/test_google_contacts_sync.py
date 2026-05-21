import pytest
from httpx import AsyncClient

from app.core import google_oauth
from app.core.config import settings


@pytest.fixture
def google_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret")


@pytest.fixture
def mock_login(monkeypatch: pytest.MonkeyPatch) -> dict:
    identity = {"email": "owner@example.com", "sub": "owner-sub"}

    async def fake_exchange(code: str, redirect_uri: str) -> dict:
        return {
            "access_token": "fresh-access",
            "refresh_token": "fresh-refresh",
            "expires_in": 3600,
            "scope": "openid email profile https://www.googleapis.com/auth/contacts.readonly",
        }

    async def fake_userinfo(access_token: str) -> dict:
        return identity

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", fake_exchange)
    monkeypatch.setattr(google_oauth, "fetch_userinfo", fake_userinfo)
    return identity


async def _connect_account_with_contacts_scope(
    client: AsyncClient, auth_headers: dict[str, str]
) -> int:
    """Spin a full connect flow and return the resulting account id."""
    init = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": ["https://www.googleapis.com/auth/contacts.readonly"]},
        headers=auth_headers,
    )
    state = init.json()["authorize_url"].split("state=")[1].split("&")[0]
    await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    accounts = (
        await client.get("/api/google-accounts", headers=auth_headers)
    ).json()
    return accounts[0]["id"]


async def test_sync_creates_contacts_from_people_api(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_login: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    account_id = await _connect_account_with_contacts_scope(client, auth_headers)

    async def fake_fetch(access_token: str) -> list[dict]:
        return [
            {
                "resourceName": "people/c1",
                "names": [{"displayName": "Ada Lovelace"}],
                "emailAddresses": [{"value": "ada@example.com"}],
                "photos": [{"url": "https://example.com/ada.png"}],
            },
            {
                "resourceName": "people/c2",
                "names": [{"displayName": "Grace Hopper"}],
                "emailAddresses": [{"value": "grace@example.com"}],
            },
        ]

    monkeypatch.setattr(google_oauth, "fetch_google_contacts", fake_fetch)

    resp = await client.post(
        f"/api/google-accounts/{account_id}/sync-contacts", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json() == {"added": 2, "updated": 0, "total": 2}

    listed = (await client.get("/api/contacts", headers=auth_headers)).json()
    names = {c["name"] for c in listed}
    assert names == {"Ada Lovelace", "Grace Hopper"}
    ada = next(c for c in listed if c["name"] == "Ada Lovelace")
    assert ada["source"] == "google"
    assert ada["google_contact_id"] == "people/c1"
    assert ada["google_account_id"] == account_id


async def test_sync_is_idempotent_and_updates_existing(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_login: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    account_id = await _connect_account_with_contacts_scope(client, auth_headers)

    payload = [
        {
            "resourceName": "people/c1",
            "names": [{"displayName": "Ada"}],
            "emailAddresses": [{"value": "ada@example.com"}],
        }
    ]

    async def fake_fetch(access_token: str) -> list[dict]:
        return payload

    monkeypatch.setattr(google_oauth, "fetch_google_contacts", fake_fetch)

    first = (
        await client.post(
            f"/api/google-accounts/{account_id}/sync-contacts",
            headers=auth_headers,
        )
    ).json()
    assert first == {"added": 1, "updated": 0, "total": 1}

    # Second pass with the same payload should not add a duplicate.
    second = (
        await client.post(
            f"/api/google-accounts/{account_id}/sync-contacts",
            headers=auth_headers,
        )
    ).json()
    assert second == {"added": 0, "updated": 0, "total": 1}

    # Now mutate the payload — name + email change → counted as updated.
    payload[0]["names"][0]["displayName"] = "Ada Lovelace"
    payload[0]["emailAddresses"][0]["value"] = "ada+new@example.com"
    third = (
        await client.post(
            f"/api/google-accounts/{account_id}/sync-contacts",
            headers=auth_headers,
        )
    ).json()
    assert third == {"added": 0, "updated": 1, "total": 1}

    listed = (await client.get("/api/contacts", headers=auth_headers)).json()
    assert len(listed) == 1
    assert listed[0]["name"] == "Ada Lovelace"
    assert listed[0]["email"] == "ada+new@example.com"


async def test_sync_requires_contacts_scope(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_login: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Connect a login-only account (no contacts scope granted).
    async def fake_exchange(code: str, redirect_uri: str) -> dict:
        return {
            "access_token": "no-scope-access",
            "refresh_token": "no-scope-refresh",
            "expires_in": 3600,
            "scope": "openid email profile",
        }

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", fake_exchange)

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
    account_id = (
        await client.get("/api/google-accounts", headers=auth_headers)
    ).json()[0]["id"]

    resp = await client.post(
        f"/api/google-accounts/{account_id}/sync-contacts",
        headers=auth_headers,
    )
    assert resp.status_code == 403


async def test_sync_keeps_existing_email_as_separate_row(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_login: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An existing contact with the same email is NOT touched. Each
    Google account gets its own row so context-bound pickers stay
    isolated."""
    account_id = await _connect_account_with_contacts_scope(client, auth_headers)

    # Pre-seed a manual contact with the email Google will return.
    await client.post(
        "/api/contacts",
        json={"name": "Ada (local)", "email": "ada@example.com"},
        headers=auth_headers,
    )

    async def fake_fetch(access_token: str) -> list[dict]:
        return [
            {
                "resourceName": "people/c1",
                "names": [{"displayName": "Ada Lovelace"}],
                "emailAddresses": [{"value": "ada@example.com"}],
            }
        ]

    monkeypatch.setattr(google_oauth, "fetch_google_contacts", fake_fetch)

    resp = await client.post(
        f"/api/google-accounts/{account_id}/sync-contacts", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json() == {"added": 1, "updated": 0, "total": 1}

    listed = (await client.get("/api/contacts", headers=auth_headers)).json()
    assert len(listed) == 2
    sources = {c["name"]: c["source"] for c in listed}
    assert sources == {"Ada (local)": "manual", "Ada Lovelace": "google"}


async def test_contacts_filter_by_context(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_login: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /contacts?context_id=N scopes to the account assigned to N."""
    account_a_id = await _connect_account_with_contacts_scope(client, auth_headers)

    async def fake_fetch_a(access_token: str) -> list[dict]:
        return [
            {
                "resourceName": "people/work-1",
                "names": [{"displayName": "Colleague"}],
                "emailAddresses": [{"value": "co@work.com"}],
            }
        ]

    monkeypatch.setattr(google_oauth, "fetch_google_contacts", fake_fetch_a)
    await client.post(
        f"/api/google-accounts/{account_a_id}/sync-contacts", headers=auth_headers
    )

    # Connect a SECOND google account (different sub) so we have two
    # disjoint sets of contacts.
    async def fake_exchange_b(code: str, redirect_uri: str) -> dict:
        return {
            "access_token": "second-access",
            "refresh_token": "second-refresh",
            "expires_in": 3600,
            "scope": "openid email profile https://www.googleapis.com/auth/contacts.readonly",
        }

    async def fake_userinfo_b(access_token: str) -> dict:
        return {"email": "personal@example.com", "sub": "second-sub"}

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", fake_exchange_b)
    monkeypatch.setattr(google_oauth, "fetch_userinfo", fake_userinfo_b)

    init = await client.post(
        "/api/google-accounts/connect",
        json={"extra_scopes": ["https://www.googleapis.com/auth/contacts.readonly"]},
        headers=auth_headers,
    )
    state = init.json()["authorize_url"].split("state=")[1].split("&")[0]
    await client.get(
        f"/api/auth/google/callback?code=fake-code&state={state}",
        follow_redirects=False,
    )
    accounts = (await client.get("/api/google-accounts", headers=auth_headers)).json()
    account_b_id = next(a["id"] for a in accounts if a["id"] != account_a_id)

    async def fake_fetch_b(access_token: str) -> list[dict]:
        return [
            {
                "resourceName": "people/fam-1",
                "names": [{"displayName": "Family"}],
            }
        ]

    monkeypatch.setattr(google_oauth, "fetch_google_contacts", fake_fetch_b)
    await client.post(
        f"/api/google-accounts/{account_b_id}/sync-contacts", headers=auth_headers
    )

    # Make two contexts, bind each to one account.
    work_ctx = (
        await client.post(
            "/api/contexts", json={"name": "Trabajo"}, headers=auth_headers
        )
    ).json()
    personal_ctx = (
        await client.post(
            "/api/contexts", json={"name": "Personal"}, headers=auth_headers
        )
    ).json()
    await client.put(
        f"/api/contexts/{work_ctx['id']}",
        json={"google_account_id": account_a_id},
        headers=auth_headers,
    )
    await client.put(
        f"/api/contexts/{personal_ctx['id']}",
        json={"google_account_id": account_b_id},
        headers=auth_headers,
    )

    # Unfiltered: both contacts visible.
    all_listed = (await client.get("/api/contacts", headers=auth_headers)).json()
    assert {c["name"] for c in all_listed} == {"Colleague", "Family"}

    # Filtered by Trabajo: only the work account's contact.
    work = (
        await client.get(
            f"/api/contacts?context_id={work_ctx['id']}", headers=auth_headers
        )
    ).json()
    assert [c["name"] for c in work] == ["Colleague"]

    # Filtered by Personal: only the family contact.
    personal = (
        await client.get(
            f"/api/contacts?context_id={personal_ctx['id']}",
            headers=auth_headers,
        )
    ).json()
    assert [c["name"] for c in personal] == ["Family"]


async def test_sync_rejects_foreign_account(
    client: AsyncClient,
    auth_headers: dict[str, str],
    google_creds: None,
    mock_login: dict,
) -> None:
    account_id = await _connect_account_with_contacts_scope(client, auth_headers)

    await client.post(
        "/api/auth/register",
        json={"email": "intruder@example.com", "password": "longenough"},
    )
    login = await client.post(
        "/api/auth/login",
        data={"username": "intruder@example.com", "password": "longenough"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = await client.post(
        f"/api/google-accounts/{account_id}/sync-contacts", headers=other
    )
    assert resp.status_code == 404
