import os

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/alfred.db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "8f50c0e14db8cf4b840e6c60207a602eb6b5b1481e1e07b77df7f739dfb32525")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

settings = Settings()
