import asyncio
import logging
import os
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.future import select

from app.api.attachments import router as attachments_router
from app.api.auth import router as auth_router
from app.api.passkeys import router as passkeys_router
from app.api.boards import DEFAULT_CONTEXT_NAME, router as boards_router
from app.api.columns import router as columns_router
from app.api.contacts import router as contacts_router
from app.api.contexts import router as contexts_router
from app.api.focus import router as focus_router
from app.api.google_accounts import router as google_accounts_router
from app.api.personal_access_tokens import router as pats_router
from app.api.push import router as push_router
from app.api.reminders import router as reminders_router
from app.api.sessions import router as sessions_router
from app.api.tags import router as tags_router
from app.api.tasks import router as tasks_router
from app.core.time import utcnow
from app.core.migrations import run_migrations
from app.database import AsyncSessionLocal, engine
from app.models.board import Board
from app.models.contact import Contact
from app.models.context import Context
from app.models.fcm_subscription import FCMSubscription
from app.models.push_subscription import PushSubscription
from app.models.reminder import Reminder
from app.models.task import Task
from app.models.user import User

log = logging.getLogger(__name__)


async def _backfill_self_contacts() -> None:
    """Ensure every existing user has a 'Yo mismo' contact. Idempotent;
    runs on every boot so users predating the feature pick one up."""
    from app.core.self_contact import ensure_self_contact

    async with AsyncSessionLocal() as session:
        users = (await session.execute(select(User))).scalars().all()
        created = False
        for user in users:
            before = (
                await session.execute(
                    select(Contact).filter(
                        Contact.user_id == user.id, Contact.is_self.is_(True)
                    )
                )
            ).scalars().first()
            if before is None:
                await ensure_self_contact(session, user)
                created = True
        if created:
            await session.commit()


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


async def _dispatch_due_reminders() -> None:
    """Find reminders whose remind_at has passed and haven't been pushed
    yet, send a Web Push to each of the owner's subscriptions, then mark
    sent_at. Imported by tests; called every minute by the lifespan loop."""
    from app.core import push as push_helper  # late import for monkeypatching

    async with AsyncSessionLocal() as session:
        now_naive = utcnow().replace(tzinfo=None)
        result = await session.execute(
            select(Reminder, Task, Board.user_id)
            .join(Task, Reminder.task_id == Task.id)
            .join(Board, Task.board_id == Board.id)
            .filter(
                Reminder.sent_at.is_(None),
                Reminder.remind_at <= now_naive,
                Task.archived_at.is_(None),
            )
        )
        rows = result.all()
        if not rows:
            return

        # Group due reminders by user so we fetch subscriptions once per user.
        by_user: dict[int, list[tuple[Reminder, Task]]] = defaultdict(list)
        for rem, task, user_id in rows:
            by_user[user_id].append((rem, task))

        from app.core import fcm as fcm_helper  # late import — optional dep

        for user_id, items in by_user.items():
            subs_result = await session.execute(
                select(PushSubscription).filter(
                    PushSubscription.user_id == user_id
                )
            )
            subs = subs_result.scalars().all()
            fcm_subs = (
                await session.execute(
                    select(FCMSubscription).filter(
                        FCMSubscription.user_id == user_id
                    )
                )
            ).scalars().all()
            if not subs and not fcm_subs:
                # Don't mark sent_at — the user may grant push later and
                # we'd rather deliver late than swallow the reminder.
                log.info(
                    "Reminders due for user %s but no push subscriptions yet; "
                    "skipping (%d pending)",
                    user_id,
                    len(items),
                )
                continue
            for rem, task in items:
                payload = {
                    "title": task.title,
                    "body": "Recordatorio de Alfred",
                    "task_id": task.id,
                    "reminder_id": rem.id,
                    "remind_at": rem.remind_at.isoformat(),
                    "tag": f"alfred-reminder-{rem.id}",
                }
                dead_subs: list[PushSubscription] = []
                delivered = False
                for sub in subs:
                    try:
                        ok, status_code = push_helper.send_push(
                            sub.endpoint, sub.p256dh, sub.auth, payload
                        )
                    except Exception as exc:  # noqa: BLE001
                        # Belt-and-braces: send_push is supposed to swallow
                        # transport errors itself, but keep going either way
                        # so FCM still gets its chance.
                        log.warning(
                            "Web Push helper raised %s for sub %s; skipping",
                            exc.__class__.__name__,
                            sub.id,
                        )
                        ok, status_code = False, None
                    if ok:
                        delivered = True
                    elif status_code in (404, 410):
                        dead_subs.append(sub)
                for sub in dead_subs:
                    await session.delete(sub)

                # FCM fan-out. Errors evict the token since FCM returns
                # well-known exceptions for invalid registrations.
                dead_fcm: list[FCMSubscription] = []
                for fsub in fcm_subs:
                    try:
                        sent_id = fcm_helper.send_fcm(
                            fsub.token,
                            title=task.title,
                            body="Recordatorio de Alfred",
                            data={
                                "task_id": str(task.id),
                                "reminder_id": str(rem.id),
                            },
                        )
                        if sent_id is not None:
                            delivered = True
                    except Exception as exc:  # noqa: BLE001
                        name = exc.__class__.__name__
                        if "NotRegistered" in name or "InvalidArgument" in name:
                            dead_fcm.append(fsub)
                        else:
                            log.warning(
                                "FCM send failed for sub %s: %s", fsub.id, exc
                            )
                for fsub in dead_fcm:
                    await session.delete(fsub)

                if delivered:
                    rem.sent_at = now_naive
                else:
                    log.warning(
                        "Reminder %s for user %s wasn't delivered to any sub",
                        rem.id,
                        user_id,
                    )
        await session.commit()


async def _reminder_dispatch_loop(stop_event: asyncio.Event) -> None:
    """Long-running background task — polls every 30 seconds. Failures are
    logged and the loop keeps going so a transient push outage doesn't
    take the loop down."""
    while not stop_event.is_set():
        try:
            await _dispatch_due_reminders()
        except Exception:
            log.exception("Reminder dispatch loop tick failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=30.0)
        except asyncio.TimeoutError:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations(engine)
    await _backfill_legacy_boards()
    await _backfill_self_contacts()
    stop_event = asyncio.Event()
    dispatch_task = asyncio.create_task(_reminder_dispatch_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        await dispatch_task
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
app.include_router(sessions_router, prefix="/api")
app.include_router(contexts_router, prefix="/api")
app.include_router(google_accounts_router, prefix="/api")
app.include_router(contacts_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(boards_router, prefix="/api")
app.include_router(columns_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(attachments_router, prefix="/api")
app.include_router(pats_router, prefix="/api")
app.include_router(reminders_router, prefix="/api")
app.include_router(push_router, prefix="/api")
app.include_router(focus_router, prefix="/api")
app.include_router(passkeys_router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Welcome to Alfred API. Visit /docs for interactive Swagger documentation."}
