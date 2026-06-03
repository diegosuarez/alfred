import os


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/alfred.db")
    # No default. A hardcoded JWT secret in the repo would let anyone with
    # read access to this code forge sessions against a running instance,
    # so we fail fast at import time if the env var is missing. Generate
    # one with: openssl rand -hex 32 — and put it in backend/.env.
    JWT_SECRET: str = os.environ["JWT_SECRET"]
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
    )  # 24 hours

    # Google OAuth2.
    # GOOGLE_CLIENT_ID/SECRET are empty by default so the rest of the app
    # boots without Google credentials configured; the auth router checks
    # both before serving its endpoints.
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    # Additional audiences accepted on /api/auth/google/native — comma
    # separated. Used to whitelist the Android / iOS OAuth client ids so
    # ID tokens issued for them can be exchanged for our own JWT.
    GOOGLE_NATIVE_AUDIENCES: str = os.getenv("GOOGLE_NATIVE_AUDIENCES", "")

    # WebAuthn / passkeys. The RP id must match the eTLD+1 of the domain
    # that serves the SPA (e.g. "alfred.diego.tcdn.es" for production).
    # The origin is the fully-qualified URL the browser sees in the URL
    # bar and is validated during attestation/assertion. Falls back to
    # APP_URL when not explicitly set.
    WEBAUTHN_RP_ID: str = os.getenv("WEBAUTHN_RP_ID", "")
    WEBAUTHN_RP_NAME: str = os.getenv("WEBAUTHN_RP_NAME", "Alfred")
    WEBAUTHN_ORIGIN: str = os.getenv("WEBAUTHN_ORIGIN", "")

    # Public base URLs.
    # APP_URL is where the backend can be reached from a browser (used to
    # build the redirect_uri sent to Google).
    # FRONTEND_URL is where we redirect users back after a successful login.
    APP_URL: str = os.getenv("APP_URL", "http://localhost:30000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:30001")


settings = Settings()
