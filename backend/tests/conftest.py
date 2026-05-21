from typing import AsyncIterator

import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
import app.main as main_module


@pytest_asyncio.fixture
async def db_engine() -> AsyncIterator[AsyncEngine]:
    # StaticPool keeps the single in-memory connection alive across
    # sessions; without it each session would get an empty database.
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client(db_engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    Session = async_sessionmaker(bind=db_engine, expire_on_commit=False, class_=AsyncSession)

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with Session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    # The reminder dispatch loop and other background helpers go straight
    # through `AsyncSessionLocal` (no dependency injection), so we
    # swap the module-level reference for the test session factory and
    # restore it afterwards.
    original_session_factory = main_module.AsyncSessionLocal
    main_module.AsyncSessionLocal = Session
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()
        main_module.AsyncSessionLocal = original_session_factory


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    email = "alice@example.com"
    password = "supersecret"
    await client.post("/api/auth/register", json={"email": email, "password": password})
    resp = await client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
