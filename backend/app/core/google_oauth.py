"""Thin Google OAuth2 client.

This module is intentionally tiny so the network-dependent pieces sit in
two named functions tests can monkeypatch:

  - exchange_code_for_token(code, redirect_uri) -> dict
  - fetch_userinfo(access_token) -> dict

Higher-level orchestration lives in app.api.auth.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.core.time import utcnow

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
PEOPLE_CONNECTIONS_URL = "https://people.googleapis.com/v1/people/me/connections"
CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly"

# Minimum scopes for "log me in with Google". Additional scopes (calendar,
# contacts) are requested incrementally in Fase 3.
LOGIN_SCOPES = ["openid", "email", "profile"]


def is_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def build_redirect_uri() -> str:
    return f"{settings.APP_URL.rstrip('/')}/api/auth/google/callback"


def build_authorize_url(state: str, scopes: Optional[list[str]] = None) -> str:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": build_redirect_uri(),
        "response_type": "code",
        "scope": " ".join(scopes or LOGIN_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "include_granted_scopes": "true",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    resp.raise_for_status()
    return resp.json()


async def fetch_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


def compute_expires_at(expires_in: Optional[int]) -> Optional[datetime]:
    if not expires_in:
        return None
    return utcnow() + timedelta(seconds=int(expires_in))


async def refresh_access_token(refresh_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    resp.raise_for_status()
    return resp.json()


async def fetch_google_contacts(access_token: str) -> list[dict]:
    """Hit /people/me/connections with paging, returning every connection
    row Google returns. Each row is a People resource (names,
    emailAddresses, photos, resourceName)."""
    results: list[dict] = []
    page_token: Optional[str] = None
    while True:
        params: dict[str, str | int] = {
            "personFields": "names,emailAddresses,photos",
            "pageSize": 200,
        }
        if page_token:
            params["pageToken"] = page_token
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                PEOPLE_CONNECTIONS_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
            )
        resp.raise_for_status()
        body = resp.json()
        results.extend(body.get("connections", []) or [])
        page_token = body.get("nextPageToken")
        if not page_token:
            break
    return results
