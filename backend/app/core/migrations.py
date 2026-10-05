"""Run Alembic migrations from inside the app, at startup."""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine

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


async def run_migrations(engine: AsyncEngine) -> None:
    """Bring the database to the latest revision.

    A database created before Alembic (tables present, no
    `alembic_version`) is first upgraded by the legacy ALTERs and
    stamped at the baseline, so the regular upgrade path takes over.
    """
    async with engine.begin() as conn:
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
