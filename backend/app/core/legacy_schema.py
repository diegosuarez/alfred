"""Pre-Alembic schema upgrades.

Before Alembic, the schema evolved through `create_all` plus the ad-hoc,
idempotent ALTERs below, run on every boot. They now run exactly once,
on a database that has no `alembic_version` table yet, to bring it up
to the 0001 baseline before it gets stamped. Don't add anything here:
new schema changes are Alembic revisions.

Can be deleted once every deployment has been stamped.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.database import Base

# Tables that exist at revision 0001. Restricting `create_all` to them
# keeps tables added by later revisions out of the way of those
# revisions' own `create_table`.
BASELINE_TABLES = (
    "users", "fcm_subscriptions", "google_accounts", "passkeys",
    "personal_access_tokens", "push_subscriptions", "tags", "contacts",
    "contexts", "boards", "columns", "tasks", "attachments",
    "focus_sessions", "reminders", "task_assignees", "task_tags",
)


async def upgrade_legacy_schema(conn: AsyncConnection) -> None:
    """Create baseline tables a legacy DB may still lack, add the
    columns later versions introduced and fold the legacy `subtasks`
    rows into child Task rows. SQLite-specific (PRAGMA, ALTER TABLE ADD
    COLUMN).
    """
    tables = [Base.metadata.tables[name] for name in BASELINE_TABLES]
    await conn.run_sync(
        lambda sync_conn: Base.metadata.create_all(sync_conn, tables=tables)
    )

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

    # Board.icon — per-board sidebar emoji.
    board_result = await conn.execute(text("PRAGMA table_info(boards)"))
    board_cols = {row[1] for row in board_result.fetchall()}
    if "icon" not in board_cols:
        await conn.execute(
            text("ALTER TABLE boards ADD COLUMN icon VARCHAR(16)")
        )

    # GoogleAccount profile snapshot.
    ga_table = (
        await conn.execute(
            text(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='google_accounts'"
            )
        )
    ).fetchall()
    if ga_table:
        ga_result = await conn.execute(text("PRAGMA table_info(google_accounts)"))
        ga_cols = {row[1] for row in ga_result.fetchall()}
        if "display_name" not in ga_cols:
            await conn.execute(
                text("ALTER TABLE google_accounts ADD COLUMN display_name VARCHAR")
            )
        if "picture_url" not in ga_cols:
            await conn.execute(
                text("ALTER TABLE google_accounts ADD COLUMN picture_url VARCHAR")
            )

    # Reminder.sent_at lands here because reminders may pre-exist.
    rem_table = (
        await conn.execute(
            text(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='reminders'"
            )
        )
    ).fetchall()
    if rem_table:
        rresult = await conn.execute(text("PRAGMA table_info(reminders)"))
        rcols = {row[1] for row in rresult.fetchall()}
        if "sent_at" not in rcols:
            await conn.execute(
                text("ALTER TABLE reminders ADD COLUMN sent_at DATETIME")
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
        if "is_self" not in ccols:
            await conn.execute(
                text(
                    "ALTER TABLE contacts ADD COLUMN is_self BOOLEAN "
                    "NOT NULL DEFAULT 0"
                )
            )
        # The unique-by-email constraint is gone: contacts are now
        # scoped per Google account so the same email can legitimately
        # repeat across accounts. The named index drop covers the
        # easy case; the rebuild block below handles anonymous
        # table-level UNIQUE constraints that DROP INDEX can't
        # touch.
        await conn.execute(
            text("DROP INDEX IF EXISTS uq_contact_user_email")
        )
        idx_rows = (
            await conn.execute(text("PRAGMA index_list('contacts')"))
        ).fetchall()
        needs_rebuild = False
        for row in idx_rows:
            # PRAGMA index_list cols: (seq, name, unique, origin, partial)
            if row[2] != 1:
                continue
            info = (
                await conn.execute(
                    text(f"PRAGMA index_info('{row[1]}')")
                )
            ).fetchall()
            cols_in_idx = sorted(r[2] for r in info)
            if cols_in_idx == ["email", "user_id"]:
                needs_rebuild = True
                break
        if needs_rebuild:
            # Rebuild contacts without the offending constraint.
            # FK rows in task_assignees / tasks.requester_id stay valid
            # because we preserve the primary keys.
            await conn.execute(
                text(
                    "CREATE TABLE contacts_new ("
                    "id INTEGER PRIMARY KEY, "
                    "user_id INTEGER NOT NULL "
                    "REFERENCES users(id) ON DELETE CASCADE, "
                    "name VARCHAR NOT NULL, "
                    "email VARCHAR, "
                    "image_url VARCHAR, "
                    "is_favorite BOOLEAN NOT NULL DEFAULT 0, "
                    "is_self BOOLEAN NOT NULL DEFAULT 0, "
                    "source VARCHAR NOT NULL DEFAULT 'manual', "
                    "google_contact_id VARCHAR, "
                    "google_account_id INTEGER "
                    "REFERENCES google_accounts(id) ON DELETE SET NULL, "
                    "created_at DATETIME, "
                    "updated_at DATETIME"
                    ")"
                )
            )
            await conn.execute(
                text(
                    "INSERT INTO contacts_new "
                    "(id, user_id, name, email, image_url, is_favorite, "
                    "is_self, source, google_contact_id, "
                    "google_account_id, created_at, updated_at) "
                    "SELECT id, user_id, name, email, image_url, "
                    "is_favorite, is_self, source, google_contact_id, "
                    "google_account_id, created_at, updated_at "
                    "FROM contacts"
                )
            )
            await conn.execute(text("DROP TABLE contacts"))
            await conn.execute(
                text("ALTER TABLE contacts_new RENAME TO contacts")
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS "
                    "ix_contacts_google_contact_id "
                    "ON contacts(google_contact_id)"
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
