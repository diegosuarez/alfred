"""Run Alembic migrations from inside the app, at startup."""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

import app.models  # noqa: F401  (registers every mapper on Base.metadata)
from app.core.legacy_schema import upgrade_legacy_schema

log = logging.getLogger(__name__)

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"
BASELINE_REVISION = "0001"


def _alembic_config(connection: Connection) -> Config:
    config = Config(str(ALEMBIC_INI))
    # env.py picks this up instead of opening its own engine.
    config.attributes["connection"] = connection
    return config


async def _set_foreign_keys(conn: AsyncConnection, enabled: bool) -> None:
    await conn.exec_driver_sql(f"PRAGMA foreign_keys={'ON' if enabled else 'OFF'}")
    # Close SQLAlchemy's autobegun transaction so conn.begin() works.
    await conn.commit()


async def run_migrations(engine: AsyncEngine) -> None:
    """Bring the database to the latest revision.

    A database created before Alembic (tables present, no
    `alembic_version`) is first upgraded by the legacy ALTERs and
    stamped at the baseline, so the regular upgrade path takes over.
    """
    async with engine.connect() as conn:
        # Batch migrations rebuild a table by dropping the old one; with
        # foreign keys on, that DROP would fire the ON DELETE CASCADEs
        # and wipe the child rows. The pragma is a no-op inside a
        # transaction, so it goes before BEGIN.
        await _set_foreign_keys(conn, False)
        try:
            async with conn.begin():
                tables = await conn.run_sync(
                    lambda sync_conn: set(inspect(sync_conn).get_table_names())
                )
                if "users" in tables and "alembic_version" not in tables:
                    log.info("Adopting pre-Alembic database at %s", BASELINE_REVISION)
                    await upgrade_legacy_schema(conn)
                    await conn.run_sync(
                        lambda sync_conn: command.stamp(
                            _alembic_config(sync_conn), BASELINE_REVISION
                        )
                    )
                await conn.run_sync(
                    lambda sync_conn: command.upgrade(_alembic_config(sync_conn), "head")
                )
        finally:
            await _set_foreign_keys(conn, True)
