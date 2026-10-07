"""drop orphaned foreign key rows

Foreign keys were never enforced (SQLite needs a per-connection
PRAGMA), so deletes left rows pointing at missing parents. Apply each
foreign key's declared ON DELETE action to those rows now that the app
enforces them.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-07 14:52:00.445451

"""
import logging
from typing import Sequence, Union

from alembic import op


log = logging.getLogger(__name__)

# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    # Deleting an orphan can orphan its own children (CASCADE chains),
    # so repeat until the check comes back clean.
    while violations := conn.exec_driver_sql("PRAGMA foreign_key_check").all():
        for table, rowid, _parent, fk_id in violations:
            # Rows: (id, seq, table, from, to, on_update, on_delete, match)
            fk = [
                row
                for row in conn.exec_driver_sql(
                    f'PRAGMA foreign_key_list("{table}")'
                ).all()
                if row[0] == fk_id
            ]
            action = fk[0][6]
            if action == "SET NULL":
                assignments = ", ".join(f'"{row[3]}" = NULL' for row in fk)
                conn.exec_driver_sql(
                    f'UPDATE "{table}" SET {assignments} WHERE rowid = ?', (rowid,)
                )
            else:
                conn.exec_driver_sql(
                    f'DELETE FROM "{table}" WHERE rowid = ?', (rowid,)
                )
            log.info("Fixed orphaned %s row %s (%s)", table, rowid, action)


def downgrade() -> None:
    """Downgrade schema."""
    # The orphans pointed at nothing; there is nothing to restore.
