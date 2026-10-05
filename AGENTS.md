# AGENTS.md — Alfred

Personal productivity app: Kanban boards split by Context, tasks with
tags, people (contacts), nested subtasks, attachments and push
reminders, plus a Pomodoro timer and stats. Single user per account,
self-hosted. This file orients agent sessions; user-level conventions
live in `~/.claude/CLAUDE.md` (Spanish for chat, English for
code/docs/commits). `notes.md` is the owner's idea backlog — ideas to
discuss, not a roadmap.

## Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2 async, aiosqlite,
  Alembic, PyJWT, bcrypt, webauthn, pywebpush, firebase-admin.
  Dependency-managed with `uv`. Entry point `backend/app/main.py`.
- **Frontend**: React 19, Vite 8, TypeScript. No UI library — vanilla
  CSS glassmorphism utilities in `src/index.css`. No router or state
  manager; view state lives in `src/App.tsx`. Installable PWA
  (`public/manifest.webmanifest`, `public/sw.js` handles Web Push).
- **CLI**: `cli/` — separate `uv` project (`alfred` command) that talks
  to the API with a Personal Access Token. See `cli/README.md`.
- **Persistence**: SQLite, schema managed by Alembic (see
  [Database migrations](#database-migrations)).
- **Container**: `docker-compose.yml` at the repo root is the
  **production** stack — code baked into the images, only
  `backend/data` bind-mounted. Backend mapped to host `30004`,
  frontend to host `30005`. Layer `docker-compose.dev.yml` on top for
  hot reload (bind mounts + Vite dev server + `--reload`). The dev
  overrides are deliberately NOT in `docker-compose.override.yml`,
  which Compose would apply implicitly and put deployments back into
  dev mode.
- **Auth**: email + password (bcrypt + JWT bearer), Google OAuth2 and
  passkeys (WebAuthn), optional "Recuérdame" refresh sessions. Registration is closed unless
  `REGISTRATION_OPEN=true`. A Google-first user has hashed_password
  NULL. Once logged in, a user may connect additional Google accounts
  (personal + work); they drive contact sync and context assignment.

## Ports (host-facing)

| Service  | Host port | Container port          |
| -------- | --------- | ----------------------- |
| backend  | 30004     | 8000                    |
| frontend | 30005     | 80 (5173 in dev)        |

Per `~/.claude/CLAUDE.md`, host-facing ports stay at ≥ 30000.

## Layout

```
backend/
  alembic.ini        Alembic config (URL comes from app settings, not here)
  migrations/        env.py + versions/ (one file per revision)
  app/
    main.py          FastAPI app, CORS, router wiring, lifespan
                     (migrations, data backfills, reminder dispatch loop)
    database.py      async engine, get_db dep, declarative Base
    core/
      config.py      Settings from env
      security.py    bcrypt hash/verify, JWT encode/decode
      pat.py         PAT generation / hashing
      sessions.py    Remember-me sessions: issue_login, refresh cookie helpers
      time.py        utcnow() — single source for tz-aware UTC now
      google_oauth.py  Thin Google OAuth2 + People API client (mockable)
      self_contact.py  ensure_self_contact(): the per-user "Yo mismo" contact
      push.py        Web Push (VAPID) sender; keys from env or data/
      fcm.py         Firebase Cloud Messaging sender (optional)
      migrations.py  run_migrations(): Alembic upgrade at startup
      legacy_schema.py  One-shot upgrade for pre-Alembic DBs (frozen)
    api/
      auth.py        register/login, registration-status, Google login/callback/native
      passkeys.py    WebAuthn register/login + list/delete
      sessions.py    /auth/refresh, /auth/logout, /auth/sessions
      deps.py        get_current_user (JWT or PAT bearer)
      contexts.py    CRUD for Contexts; google_account_id assignment
      google_accounts.py  list, connect (incremental OAuth), delete, sync-contacts
      contacts.py    User contacts (manual + synced from Google)
      tags.py        User-scoped Tag CRUD
      boards.py      CRUD; create_board seeds 3 default columns + default Context
      columns.py     CRUD, reorder, archive-all, archived-tasks
      tasks.py       CRUD, reorder, move, subtasks (child tasks)
      attachments.py Upload/download/delete files (data/attachments/, 15 MB cap)
      reminders.py   Per-task reminders + pending list
      push.py        Web Push / FCM subscriptions, VAPID public key, test push
      personal_access_tokens.py  Mint/list/revoke PATs (secret returned ONCE)
      focus.py       POST /focus, GET /focus/stats (7-day series)
    models/          SQLAlchemy ORM, all re-exported from models/__init__.py
    schemas/         Pydantic v2 request/response models
  tests/             pytest suite, in-memory SQLite (+ file DBs for migrations)
  scripts/           One-off maintenance scripts

frontend/src/
  App.tsx            Auth gate + view switcher (board|stats) + overlays
  main.tsx           StrictMode root
  services/          api.ts (fetch wrapper), push.ts, webauthn.ts
  hooks/             useAuthedImage, useEscapeKey
  components/
    Auth.tsx         Login/register, Google button, passkey login
    Sidebar.tsx      Context pill bar + board list + view switcher + settings
    KanbanBoard.tsx  Board orchestrator: state, data loading, wiring
    kanban/
      KanbanColumn.tsx    Column header, rename, ⋯ menu, task list + drop gaps
      TaskCard.tsx        Card (cover image, tags, people, counters)
      NewTaskForm.tsx     Inline "add task" form
      FilterBar.tsx       Search + filter button + active chips
      CardMenu.tsx        Right-click actions wired to TaskContextMenu
      TaskDetailModal.tsx Task modal: auto-saving fields, people, attachments
      TaskDetailSections.tsx  Parent / subtasks / tags / reminders sections
      taskModalStyles.ts  Styles shared by the modal and its sections
      useBoardDragDrop.ts HTML5 drag&drop state + move/reorder calls
      utils.ts, types.ts  Pure helpers (filters, flattening) and shared types
    TaskContextMenu.tsx  Right-click menu on cards
    ArchivedTasksModal.tsx, FilterModal.tsx, AttachmentsSection.tsx,
    ContactPicker.tsx, ReminderPicker.tsx, MarkdownView.tsx, EmojiPicker.tsx,
    Avatar.tsx       Building blocks used by the board and modals
    ReminderAlerts.tsx  In-app reminder banners + snooze
    FocusTimer.tsx   Pomodoro modes; floating overlay
    QuickCapture.tsx Alt+Q modal that creates a task anywhere
    Statistics.tsx   KPIs + custom SVG bar chart (no chart lib)
    GoogleSettings.tsx, ContactsSettings.tsx, TokensSettings.tsx,
    SessionsSettings.tsx  Settings modals (Google accounts, contacts, PATs,
                     remembered sessions)

cli/                 Terminal client (uv project, PAT auth)
deploy/              deploy.sh + nginx vhost template (host install)
systemd/             Unit template + installer
```

## Domain model

```
User 1─* GoogleAccount         (personal / work / ...)
User 1─* Context               (Trabajo, Personal, Familia, ...)
   Context *─1 GoogleAccount   (optional, multiple contexts may share one)
User 1─* Contact               (manual or synced from a GoogleAccount)
User 1─* Tag                   (urgent, blocked, ..., user-scoped)
User 1─* PersonalAccessToken / Passkey / UserSession / PushSubscription / FCMSubscription
Context 1─* Board 1─* Column 1─* Task
   Task *─1 Task               (parent_task_id: subtasks, any depth)
   Task *─* Tag                (task_tags)
   Task *─1 Contact            (requester_id)
   Task *─* Contact            (task_assignees)
   Task 1─* Reminder / Attachment / FocusSession
```

- A Context belongs to one User; a User has many. Context name is
  unique per user. "Todos" (null in the UI) is a synthetic
  no-filter; it is NOT stored.
- Board.context_id is nullable at the SQL level for the legacy DB
  path, but application code always assigns one. POST /boards without
  context_id lazily creates a "General" context.
- A Google account may be unattached to any context (e.g. used only
  for login). Detaching a context from a Google account uses the
  sentinel value `0` in the update body, since JSON cannot send a
  "set to null" distinct from "absent".
- Tags are user-scoped, not context-scoped. "Urgente" means urgente
  in every context — filters and per-context views do the slicing.
- TaskUpdate.tag_ids has 3-state semantics: absent means no change,
  `[]` clears all tags, a non-empty list replaces the full set.
  TaskCreate.tag_ids defaults to `[]`.
- Subtasks are regular `Task` rows with `parent_task_id` set (the old
  `subtasks` table is gone). They use the `completed` flag instead of
  column moves; deleting a parent cascades to its children.
- Archiving sets `Task.archived_at`; archived tasks drop out of the
  board detail and reminder dispatch, and show up in the column's
  archived-tasks view.
- Every user has exactly one `is_self` contact ("Yo mismo"), created
  on register / Google login and backfilled at startup. Contacts are
  scoped per Google account, so the same email may repeat. Deleting a
  contact sets `requester_id` to NULL.
- `Task` has FKs to both `column_id` and `board_id`. The board FK is
  redundant for ownership checks but used by joins for cross-column
  queries.
- `Task.total_focus_time` is a `@property` that only sums sessions if
  the relationship has been **eagerly loaded**; otherwise it returns
  `0`. This avoids triggering lazy SQL under the async engine. Opt in
  with `selectinload(Task.focus_sessions)` when you need the real
  value (already done in `get_board_detail`).
- All ownership checks `join(Board).filter(Board.user_id == ...)`.
  Single-tenant per user, no RBAC.

## Reminders and push

The lifespan starts a loop that every 30 s picks reminders with
`remind_at <= now`, `sent_at IS NULL` and a non-archived task, and
fans them out to the owner's Web Push and FCM subscriptions. It sets
`sent_at` only if at least one delivery succeeded — a user without
subscriptions gets the reminder late instead of never. Dead
subscriptions (404/410, FCM NotRegistered) are deleted. Tests call
`app.main._dispatch_due_reminders` directly with the push helpers
monkeypatched.

VAPID keys come from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` or are
generated into `data/vapid_keys.json`. FCM is optional
(`FCM_SERVICE_ACCOUNT_JSON_PATH`, default under `data/`).

## Sessions and "Recuérdame"

Every login path (password, Google, passkey) goes through
`core/sessions.issue_login`. Without `remember` it returns a plain
access JWT (`ACCESS_TOKEN_EXPIRE_MINUTES`, 24 h). With it, it also
opens a `UserSession` and sets an opaque refresh token in an
HttpOnly, `SameSite=Lax`, `Path=/api/auth` cookie (`alfred_refresh`).
Google carries the flag inside the signed OAuth state.

- `POST /auth/refresh` trades the cookie for a new JWT and slides the
  session's expiry to 90 days from now: a device used at least once
  every 90 days never logs in again. The cookie value is deliberately
  not rotated — concurrent tabs/PWA refreshing at once would race
  each other into a logout.
- JWTs minted from a session carry `sid`; `get_current_user` rejects
  them once the session is revoked, so revoking a lost phone is
  immediate instead of waiting out the JWT.
- `POST /auth/logout` revokes the cookie's session.
  `GET/DELETE /auth/sessions` power the **📱 Sesiones** modal.
- Frontend: `authedFetch` in `services/api.ts` retries once after a
  shared `refreshSession()` on any 401; `App.tsx` also tries a silent
  refresh on boot when there is no JWT in localStorage (fresh tab,
  storage evicted — Safari ITP wipes script storage, not server-set
  cookies). Use `authedFetch` for any raw fetch to the API.
- The CLI keeps using PATs; `POST /auth/google/native` doesn't support
  remember.

## Personal Access Tokens (PATs)

`get_current_user` accepts either a JWT or a PAT in the same
`Authorization: Bearer ...` header — branching on the
`alfred_pat_` prefix. PATs are random 32-char URL-safe secrets prefixed
with `alfred_pat_`; we store SHA-256 of the full token plus the first
8 chars of the random portion as an indexed lookup `prefix`. The
plaintext token is shown exactly once at creation. Revocation is a
soft delete (sets `revoked_at`) so audit fields survive.

Use PATs for headless clients (the CLI, AI assistants). Mint and
revoke from the **🔑 Tokens API** modal.

## OAuth2 with Google

The state passed to Google is a signed dict
(`itsdangerous.URLSafeTimedSerializer`) carrying a nonce and, when the
caller was already authenticated, a `user_id` and the granted scopes.
The matching value is mirrored in an HttpOnly cookie (`alfred_oauth_state`)
scoped to `/api/auth/google`, so the callback can verify the redirect
belongs to a request we started.

The single callback (`GET /api/auth/google/callback`) does both:
- No `user_id` in state → login flow: find user by email or create
  a passwordless one. Issue JWT and redirect to FRONTEND_URL with
  `?token=...`.
- `user_id` present → connect flow: attach a GoogleAccount to that
  user. Redirect to FRONTEND_URL with `?google_connected=1`.

`POST /api/auth/google/native` accepts an ID token from a native
client (audiences in `GOOGLE_NATIVE_AUDIENCES`).

For tests, monkeypatch `app.core.google_oauth.exchange_code_for_token`
and `fetch_userinfo`. State validation is exercised directly.

## Database migrations

Alembic owns the schema. `run_migrations()` (`app/core/migrations.py`)
runs `alembic upgrade head` from the lifespan on every boot, on the
app's own connection — there is no separate migrate step in Docker or
systemd.

- **Changing a model**: edit it, then generate a revision and review
  it before committing (autogenerate is a draft, not gospel):

  ```bash
  cd backend
  uv run alembic revision --autogenerate -m "add foo to tasks"
  uv run alembic upgrade head      # against ./data/alfred.db
  ```

  `env.py` enables `render_as_batch`, so SQLite ALTERs become table
  rebuilds. Data migrations go in the revision too.
- `tests/test_migrations.py` fails if the models and the migrated
  schema diverge — that's the reminder to write the revision.
- Test fixtures still build the schema with `Base.metadata.create_all`
  (fast, in-memory); only the migration tests go through Alembic.
- Pre-Alembic databases (tables present, no `alembic_version`) are
  adopted once: `legacy_schema.upgrade_legacy_schema` replays the old
  ad-hoc ALTERs, the DB is stamped at `0001`, and `0002` adds the
  indexes those ALTERs never created. That module is frozen — never
  add schema changes to it; delete it once every deployment is
  stamped.
- SQLite reflection doesn't parse `ON DELETE` on inline `REFERENCES`,
  so autogenerate against an adopted DB proposes bogus FK
  drop/re-create pairs. Check `PRAGMA foreign_key_list(<table>)` and
  drop them from the revision.

`_backfill_legacy_boards` and `_backfill_self_contacts` in `main.py`
are idempotent data backfills that still run on every boot.

## Running locally

### Whole stack via Docker

```bash
# Development — hot reload on both services.
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Production shape — static SPA behind nginx, no source mounts.
docker compose up --build

# Frontend: http://localhost:30005
# Backend:  http://localhost:30004  (Swagger at /docs)
```

The SQLite DB lives at `backend/data/alfred.db` on the host (bind
mounted in both modes), together with attachments and the VAPID/FCM
keys. Nothing else in the tree is state.

Production serves `frontend/dist` from nginx inside the container
(`frontend/nginx.conf`), so `npm run build` — and with it `tsc -b` —
has to pass before a deploy. The dev server does not type-check.

### Backend only, without Docker

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 30004
```

`JWT_SECRET` is required (the app refuses to start without it). DB
defaults to `./data/alfred.db` (relative to `backend/`).

### Frontend only, without Docker

```bash
cd frontend
npm install
npm run dev -- --port 30005
```

The dev server picks up `VITE_API_URL` (default `http://localhost:30004`).

### Tests

```bash
cd backend
uv run pytest        # ~130 tests, in-memory SQLite, ~1 min
```

Tests use `httpx.AsyncClient` + `ASGITransport`, so the FastAPI
lifespan does NOT run; the conftest creates tables itself and swaps
`AsyncSessionLocal` for background helpers. New tests should rely on
the `client` and `auth_headers` fixtures. The conftest sets
`JWT_SECRET` and `REGISTRATION_OPEN` before importing the app.

If `uv run pytest` fails with "Failed to spawn" or missing modules
after the repo moved directories, the `.venv` shebangs are stale:
`rm -rf .venv && uv sync`.

### Deploy / systemd (host install)

```bash
sudo ALFRED_DOMAIN=alfred.example.com LE_EMAIL=you@example.com bash deploy/deploy.sh
# or just the unit:
sudo systemd/install.sh
```

`deploy.sh` brings up the compose stack plus an nginx vhost with a
Let's Encrypt cert. The systemd installer substitutes `__ALFRED_DIR__`
in the unit with the repo path; the unit drives
`docker compose up -d --build` / `down`.

## CodeGraph

`.codegraph/` is initialized. Prefer `codegraph_*` MCP tools over grep
for symbol lookups. The watcher debounces ~500 ms behind file writes.

## Conventions

- Spanish in chat; English everywhere in code, comments, commits, and
  docs (see `~/.claude/CLAUDE.md`).
- Commits are atomic and conventional:
  `<type>(<scope>): <subject>` with subject ≤ 50 chars, imperative,
  no trailing period. Add a body explaining *why* for non-trivial
  changes.
- New endpoints: register a router in `app/main.py` under the
  `/api` prefix. Add a Pydantic schema for request and response.
  Cover with at least one happy-path and one auth/ownership test.
- New models: declare in `app/models/`, import from
  `app/models/__init__.py` (Alembic only sees what's imported there),
  use `app.core.time.utcnow` for defaults — never
  `datetime.utcnow()` — and add an Alembic revision.
- Frontend views are local state in `App.tsx`. Refresh is forced via
  the `refreshTrigger` counter.

## Configuration & secrets

`backend/.env.example` documents the env vars. Required: `JWT_SECRET`.
Required for the Google flows: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `APP_URL`, `FRONTEND_URL`. Without the Google
pair, Google endpoints return 503 and the rest of the app keeps
working. Passkeys need `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` matching
the public hostname. CORS: `CORS_ORIGINS`, `CORS_ORIGIN_REGEX`.

Authorized redirect URI to register in Google Cloud Console:
`{APP_URL}/api/auth/google/callback`.

## Known sharp edges (not blocking, fix when relevant)

- `columns.reorder_columns` still issues one SELECT per id (N+1).
  Trivial today, bulk update if it grows. `tasks.reorder_tasks`
  already uses a single batched SELECT.
- `Quick Capture` (Alt+Q) re-fetches columns for any board it shows;
  it could share board details fetched by other views.
- The Google access-token refresh helper lives privately in
  `api/google_accounts.py` (used by contact sync). Move it to
  `core/google_oauth.py` when a second Google API (Calendar) needs it.
- The `0` sentinel to detach a Google account from a Context is a
  Pydantic-driven workaround; a cleaner schema would use PATCH semantics.
