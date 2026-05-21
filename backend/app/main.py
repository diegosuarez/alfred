from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, AsyncSessionLocal
from app.api.auth import router as auth_router
from app.api.boards import router as boards_router, DEFAULT_CONTEXT_NAME
from app.api.columns import router as columns_router
from app.api.contexts import router as contexts_router
from app.api.google_accounts import router as google_accounts_router
from app.api.tags import router as tags_router
from app.api.tasks import router as tasks_router
from app.api.subtasks import router as subtasks_router
from app.api.personal_access_tokens import router as pats_router
from app.api.focus import router as focus_router
from app.models.board import Board
from app.models.context import Context
from sqlalchemy.future import select
from collections import defaultdict

async def _backfill_legacy_boards() -> None:
    """Boards created before contexts existed land with context_id NULL.
    Group them by user, ensure each user has a default context, and
    attach the orphan boards. Idempotent — safe to run on every boot.
    """
    async with AsyncSessionLocal() as session:
        orphans = (
            await session.execute(select(Board).filter(Board.context_id.is_(None)))
        ).scalars().all()
        if not orphans:
            return

        by_user: dict[int, list[Board]] = defaultdict(list)
        for board in orphans:
            by_user[board.user_id].append(board)

        for user_id, user_boards in by_user.items():
            ctx = (
                await session.execute(
                    select(Context).filter(
                        Context.user_id == user_id,
                        Context.name == DEFAULT_CONTEXT_NAME,
                    )
                )
            ).scalars().first()
            if not ctx:
                ctx = Context(user_id=user_id, name=DEFAULT_CONTEXT_NAME)
                session.add(ctx)
                await session.flush()
            for board in user_boards:
                board.context_id = ctx.id

        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize SQLite database tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _backfill_legacy_boards()
    yield
    # Dispose of engine connection pool on shutdown
    await engine.dispose()

app = FastAPI(
    title="Alfred API",
    description="Sleek personal task manager API backend",
    version="1.0.0",
    lifespan=lifespan
)

import os

# CORS middleware. Allow-credentials + wildcard origins is invalid per
# the CORS spec, so we list dev origins explicitly. Extend via env.
#   CORS_ORIGINS       comma-separated literal origins
#   CORS_ORIGIN_REGEX  optional regex matched against the Origin header
#                      (useful for Tailscale / LAN where the hostname
#                       changes per device).
_default_origins = "http://localhost:5173,http://localhost:30001,http://127.0.0.1:5173,http://127.0.0.1:30001"
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]
_origin_regex = os.getenv("CORS_ORIGIN_REGEX") or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wire up routers
app.include_router(auth_router, prefix="/api")
app.include_router(contexts_router, prefix="/api")
app.include_router(google_accounts_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(boards_router, prefix="/api")
app.include_router(columns_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(subtasks_router, prefix="/api")
app.include_router(pats_router, prefix="/api")
app.include_router(focus_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Alfred API. Visit /docs for interactive Swagger documentation."}
