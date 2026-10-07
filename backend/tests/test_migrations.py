from pathlib import Path

import pytest_asyncio
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.migrations import ALEMBIC_INI, run_migrations
from app.database import Base


@pytest_asyncio.fixture
async def file_engine(tmp_path: Path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'alfred.db'}")
    try:
        yield engine
    finally:
        await engine.dispose()


def _head() -> str:
    return ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_current_head()


async def _current_revision(engine: AsyncEngine) -> str | None:
    async with engine.connect() as conn:
        return await conn.run_sync(
            lambda c: MigrationContext.configure(c).get_current_revision()
        )


async def test_fresh_database_matches_models(file_engine):
    await run_migrations(file_engine)

    assert await _current_revision(file_engine) == _head()
    async with file_engine.connect() as conn:
        diff = await conn.run_sync(
            lambda c: compare_metadata(
                MigrationContext.configure(c, opts={"compare_type": True}),
                Base.metadata,
            )
        )
    # A non-empty diff means a model changed without a revision:
    # run `uv run alembic revision --autogenerate -m "..."`.
    assert diff == []


async def test_migrations_are_idempotent(file_engine):
    await run_migrations(file_engine)
    await run_migrations(file_engine)

    assert await _current_revision(file_engine) == _head()


async def test_pre_alembic_database_is_adopted(file_engine):
    # Shape of a DB from before contexts/archiving/subtasks-as-tasks:
    # tasks lacks the later columns and subtasks is still its own table.
    async with file_engine.begin() as conn:
        for ddl in (
            "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR NOT NULL, "
            "hashed_password VARCHAR, created_at DATETIME, updated_at DATETIME)",
            "CREATE TABLE boards (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, "
            "user_id INTEGER NOT NULL, created_at DATETIME, updated_at DATETIME)",
            "CREATE TABLE columns (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, "
            "position INTEGER NOT NULL, board_id INTEGER NOT NULL, "
            "created_at DATETIME, updated_at DATETIME)",
            "CREATE TABLE tasks (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, "
            "description VARCHAR, priority VARCHAR NOT NULL, due_date DATETIME, "
            "position INTEGER NOT NULL, column_id INTEGER NOT NULL, "
            "board_id INTEGER NOT NULL, created_at DATETIME, updated_at DATETIME)",
            "CREATE TABLE subtasks (id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL, "
            "title VARCHAR NOT NULL, completed BOOLEAN NOT NULL, "
            "position INTEGER NOT NULL, created_at DATETIME, updated_at DATETIME)",
            "INSERT INTO users (id, email) VALUES (1, 'a@example.com')",
            "INSERT INTO boards (id, title, user_id) VALUES (1, 'B', 1)",
            "INSERT INTO columns (id, title, position, board_id) VALUES (1, 'C', 0, 1)",
            "INSERT INTO tasks (id, title, priority, position, column_id, board_id) "
            "VALUES (1, 'Parent', 'medium', 0, 1, 1)",
            "INSERT INTO subtasks (task_id, title, completed, position) "
            "VALUES (1, 'Child', 1, 0)",
        ):
            await conn.execute(text(ddl))

    await run_migrations(file_engine)

    assert await _current_revision(file_engine) == _head()
    async with file_engine.connect() as conn:
        tables, task_cols, task_indexes = await conn.run_sync(
            lambda c: (
                set(inspect(c).get_table_names()),
                {col["name"] for col in inspect(c).get_columns("tasks")},
                {idx["name"] for idx in inspect(c).get_indexes("tasks")},
            )
        )
        children = (
            await conn.execute(
                text("SELECT title, completed FROM tasks WHERE parent_task_id = 1")
            )
        ).all()

    assert "subtasks" not in tables
    assert {"attachments", "passkeys", "reminders", "contacts"} <= tables
    assert {"parent_task_id", "completed", "requester_id", "archived_at"} <= task_cols
    assert {"ix_tasks_parent_task_id", "ix_tasks_archived_at"} <= task_indexes
    assert children == [("Child", 1)]


async def test_orphaned_rows_get_their_on_delete_action(file_engine):
    await run_migrations(file_engine)
    async with file_engine.connect() as conn:
        # Recreate what years of unenforced foreign keys left behind,
        # then rewind so 0004 runs again.
        await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        await conn.commit()
        for sql in (
            "INSERT INTO users (id, email) VALUES (1, 'a@example.com')",
            "INSERT INTO boards (id, name, user_id) VALUES (1, 'B', 1)",
            "INSERT INTO columns (id, name, position, board_id) VALUES (1, 'C', 0, 1)",
            "INSERT INTO tasks (id, title, priority, position, column_id, board_id, requester_id) "
            "VALUES (1, 'Kept', 'medium', 0, 1, 1, 99)",
            # Orphan whose own child must go too (CASCADE chain).
            "INSERT INTO tasks (id, title, priority, position, column_id, board_id) "
            "VALUES (2, 'Orphan', 'medium', 0, 42, 1)",
            "INSERT INTO tasks (id, title, priority, position, column_id, board_id, parent_task_id) "
            "VALUES (3, 'Child', 'medium', 0, 1, 1, 2)",
            "INSERT INTO task_assignees (task_id, contact_id) VALUES (1, 99)",
            "UPDATE alembic_version SET version_num = '0003'",
        ):
            await conn.execute(text(sql))
        await conn.commit()

    await run_migrations(file_engine)

    async with file_engine.connect() as conn:
        tasks = (await conn.execute(text("SELECT id, requester_id FROM tasks"))).all()
        assignees = (await conn.execute(text("SELECT * FROM task_assignees"))).all()
        violations = (await conn.exec_driver_sql("PRAGMA foreign_key_check")).all()
    assert tasks == [(1, None)]
    assert assignees == []
    assert violations == []


async def test_foreign_keys_stay_enforced_after_migrations(file_engine):
    await run_migrations(file_engine)
    async with file_engine.connect() as conn:
        enabled = (await conn.exec_driver_sql("PRAGMA foreign_keys")).scalar()
    assert enabled == 1
