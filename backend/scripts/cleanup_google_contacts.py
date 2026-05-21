"""One-shot maintenance: drop all Google-synced contacts for a given
Google account so the next /sync-contacts call rebuilds them cleanly.

Usage (from the backend directory):

    uv run python scripts/cleanup_google_contacts.py --list
    uv run python scripts/cleanup_google_contacts.py --account-id 4 --dry-run
    uv run python scripts/cleanup_google_contacts.py --account-id 4

Or inside the docker-compose backend container:

    docker compose exec backend \
        uv run python scripts/cleanup_google_contacts.py --account-id 4

Only touches rows the user already imported from Google (anything with
`google_contact_id IS NOT NULL` that belongs to the chosen account).
Manual contacts and the synthetic "Yo mismo" survive.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Make the project's `app` package importable when this script is run
# directly (python scripts/cleanup_google_contacts.py). Without this
# Python only puts the script's own folder on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
# Importing every model registers its mapper with SQLAlchemy so the
# relationship() strings (e.g. Task.attachments -> "Attachment") can be
# resolved even though the script itself only touches contacts.
from app.models.attachment import Attachment  # noqa: E402, F401
from app.models.board import Board  # noqa: E402, F401
from app.models.contact import Contact  # noqa: E402
from app.models.context import Context  # noqa: E402, F401
from app.models.google_account import GoogleAccount  # noqa: E402
from app.models.push_subscription import PushSubscription  # noqa: E402, F401
from app.models.reminder import Reminder  # noqa: E402, F401
from app.models.task import Task  # noqa: E402, F401
from app.models.user import User  # noqa: E402, F401


async def list_accounts() -> None:
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(select(GoogleAccount).order_by(GoogleAccount.id))
        ).scalars().all()
        if not rows:
            print("(no Google accounts connected)")
            return
        for r in rows:
            print(
                f"#{r.id:<4} user_id={r.user_id:<4} "
                f"email={r.email}  display={r.display_name or '-'}"
            )


async def count_targets(account_id: int) -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Contact).filter(
                Contact.google_account_id == account_id,
                Contact.google_contact_id.is_not(None),
            )
        )
        return len(result.scalars().all())


async def wipe_all(dry_run: bool) -> None:
    """Drop every Contact row except the synthetic 'Yo mismo' ones, no
    matter which Google account they came from (or none). Useful when
    legacy rows pre-date the google_account_id column and the per-account
    cleanup misses them."""
    async with AsyncSessionLocal() as session:
        target_rows = (
            await session.execute(
                select(Contact).filter(Contact.is_self.is_(False))
            )
        ).scalars().all()
        print(f"Found {len(target_rows)} non-self contacts.")
        for c in target_rows[:10]:
            print(
                f"  - #{c.id} {c.name} <{c.email or ''}>  "
                f"src={c.source} acct={c.google_account_id}"
            )
        if len(target_rows) > 10:
            print(f"  … and {len(target_rows) - 10} more.")
        if dry_run:
            print("Dry run — no rows deleted.")
            return
        result = await session.execute(
            delete(Contact).where(Contact.is_self.is_(False))
        )
        await session.commit()
        print(f"Deleted {result.rowcount} rows.")


async def run(account_id: int, dry_run: bool) -> None:
    async with AsyncSessionLocal() as session:
        # Show the account so the operator can sanity-check the target.
        acct = (
            await session.execute(
                select(GoogleAccount).filter(GoogleAccount.id == account_id)
            )
        ).scalars().first()
        if not acct:
            print(f"No Google account with id {account_id}.", file=sys.stderr)
            sys.exit(1)
        print(
            f"Target account: #{acct.id} {acct.email} "
            f"(user_id={acct.user_id})"
        )

        target_rows = (
            await session.execute(
                select(Contact).filter(
                    Contact.google_account_id == account_id,
                    Contact.google_contact_id.is_not(None),
                )
            )
        ).scalars().all()
        print(f"Found {len(target_rows)} Google-synced contacts.")
        for c in target_rows[:10]:
            print(f"  - #{c.id} {c.name} <{c.email or ''}>  rid={c.google_contact_id}")
        if len(target_rows) > 10:
            print(f"  … and {len(target_rows) - 10} more.")

        if dry_run:
            print("Dry run — no rows deleted.")
            return

        result = await session.execute(
            delete(Contact).where(
                Contact.google_account_id == account_id,
                Contact.google_contact_id.is_not(None),
            )
        )
        await session.commit()
        print(f"Deleted {result.rowcount} rows.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--list",
        action="store_true",
        help="List connected Google accounts and exit.",
    )
    parser.add_argument(
        "--account-id",
        type=int,
        help="Google account id to scrub (see --list).",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help=(
            "Delete EVERY contact except the synthetic 'Yo mismo'. "
            "Use this when legacy rows predate google_account_id and "
            "per-account cleanup leaves them behind."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without committing.",
    )
    args = parser.parse_args()

    if args.list:
        asyncio.run(list_accounts())
        return
    if args.all:
        asyncio.run(wipe_all(args.dry_run))
        return
    if args.account_id is None:
        parser.error("--account-id, --all or --list is required")
    asyncio.run(run(args.account_id, args.dry_run))


if __name__ == "__main__":
    main()
