"""add indexes missing on pre-Alembic databases

Databases created before Alembic got some columns through ad-hoc
`ALTER TABLE ADD COLUMN` (and `contacts` through a table rebuild),
which never created the indexes the models declare. Fresh databases
already have them from 0001, hence IF NOT EXISTS.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-05 09:40:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEXES = [
    ('ix_tasks_parent_task_id', 'tasks', ['parent_task_id']),
    ('ix_tasks_requester_id', 'tasks', ['requester_id']),
    ('ix_tasks_archived_at', 'tasks', ['archived_at']),
    ('ix_reminders_sent_at', 'reminders', ['sent_at']),
    ('ix_contacts_id', 'contacts', ['id']),
]


def upgrade() -> None:
    for name, table, columns in _INDEXES:
        op.create_index(name, table, columns, if_not_exists=True)


def downgrade() -> None:
    # The indexes belong to the 0001 schema; nothing to undo.
    pass
