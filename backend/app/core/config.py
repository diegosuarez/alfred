import os


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/alfred.db")
    JWT_SECRET: str = os.getenv(
        "JWT_SECRET",
        "8f50c0e14db8cf4b840e6c60207a602eb6b5b1481e1e07b77df7f739dfb32525",
    )
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

    # Public base URLs.
    # APP_URL is where the backend can be reached from a browser (used to
    # build the redirect_uri sent to Google).
    # FRONTEND_URL is where we redirect users back after a successful login.
    APP_URL: str = os.getenv("APP_URL", "http://localhost:30000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:30001")


settings = Settings()
