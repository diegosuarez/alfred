import os
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.future import select

from app.api.auth import router as auth_router
from app.api.boards import DEFAULT_CONTEXT_NAME, router as boards_router
from app.api.columns import router as columns_router
from app.api.contacts import router as contacts_router
from app.api.contexts import router as contexts_router
from app.api.focus import router as focus_router
from app.api.google_accounts import router as google_accounts_router
from app.api.personal_access_tokens import router as pats_router
from app.api.tags import router as tags_router
from app.api.tasks import router as tasks_router
from app.database import AsyncSessionLocal, Base, engine
from app.models.board import Board
from app.models.context import Context


async def _migrate_task_schema() -> None:
    """Add parent_task_id / completed columns and migrate any leftover
    `subtasks` rows into Task rows hung under their parent. Idempotent.
    SQLite-specific (PRAGMA, ALTER TABLE ADD COLUMN).
    """
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(tasks)"))
        cols = {row[1] for row in result.fetchall()}
        if "parent_task_id" not in cols:
            await conn.execute(
                text(
                    "ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER "
                    "REFERENCES tasks(id) ON DELETE CASCADE"
                )
            )
        if "completed" not in cols:
            await conn.execute(
                text(
                    "ALTER TABLE tasks ADD COLUMN completed BOOLEAN NOT NULL DEFAULT 0"
                )
            )
        if "requester_id" not in cols:
            await conn.execute(
                text(
                    "ALTER TABLE tasks ADD COLUMN requester_id INTEGER "
                    "REFERENCES contacts(id) ON DELETE SET NULL"
                )
            )
        if "archived_at" not in cols:
            await conn.execute(
                text("ALTER TABLE tasks ADD COLUMN archived_at DATETIME")
            )

        # Contact provenance fields, added once contacts existed locally.
        contact_table = (
            await conn.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type='table' AND name='contacts'"
                )
            )
        ).fetchall()
        if contact_table:
            cresult = await conn.execute(text("PRAGMA table_info(contacts)"))
            ccols = {row[1] for row in cresult.fetchall()}
            if "source" not in ccols:
                await conn.execute(
                    text(
                        "ALTER TABLE contacts ADD COLUMN source VARCHAR "
                        "NOT NULL DEFAULT 'manual'"
                    )
                )
            if "google_contact_id" not in ccols:
                await conn.execute(
                    text("ALTER TABLE contacts ADD COLUMN google_contact_id VARCHAR")
                )
            if "google_account_id" not in ccols:
                await conn.execute(
                    text(
                        "ALTER TABLE contacts ADD COLUMN google_account_id INTEGER "
                        "REFERENCES google_accounts(id) ON DELETE SET NULL"
                    )
                )

        # If the legacy subtasks table still has rows, fold them in as
        # children of their parent task.
        existing = (
            await conn.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type='table' AND name='subtasks'"
                )
            )
        ).fetchall()
        if existing:
            await conn.execute(
                text(
                    "INSERT INTO tasks "
                    "(title, description, priority, due_date, position, "
                    "column_id, board_id, parent_task_id, completed, "
                    "created_at, updated_at) "
                    "SELECT s.title, NULL, 'medium', NULL, s.position, "
                    "t.column_id, t.board_id, s.task_id, s.completed, "
                    "s.created_at, s.updated_at "
                    "FROM subtasks s JOIN tasks t ON s.task_id = t.id"
                )
            )
            await conn.execute(text("DROP TABLE subtasks"))


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
    await _migrate_task_schema()
    await _backfill_legacy_boards()
    yield
    await engine.dispose()


app = FastAPI(
    title="Alfred API",
    description="Sleek personal task manager API backend",
    version="1.0.0",
    lifespan=lifespan,
)

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
app.include_router(contacts_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(boards_router, prefix="/api")
app.include_router(columns_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(pats_router, prefix="/api")
app.include_router(focus_router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Welcome to Alfred API. Visit /docs for interactive Swagger documentation."}
