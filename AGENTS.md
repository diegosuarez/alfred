# AGENTS.md — Alfred

Personal productivity prototype (Kanban + Pomodoro + stats). Early
stage, local-first development. This file orients agent sessions;
user-level conventions live in `~/.claude/CLAUDE.md` (Spanish for
chat, English for code/docs/commits).

## Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2 async, aiosqlite,
  PyJWT, bcrypt. Dependency-managed with `uv`. Entry point
  `backend/app/main.py`.
- **Frontend**: React 19, Vite 8, TypeScript. No UI library — vanilla
  CSS glassmorphism utilities in `src/index.css`. No router or state
  manager; view state lives in `src/App.tsx`.
- **Persistence**: SQLite. Schema is created on startup via
  `Base.metadata.create_all` (no migrations).
- **Container**: `docker-compose.yml` at the repo root. Backend mapped
  to host `30000`, frontend to host `30001`. Bind mounts give hot
  reload.
- **Auth**: email + password (bcrypt + JWT bearer) AND Google OAuth2.
  Login routes coexist; a Google-first user has hashed_password NULL.
  Once logged in, a user may also connect additional Google accounts
  (personal + work) for future Calendar/Contacts integration.

## Ports (host-facing)

| Service  | Host port | Container port |
| -------- | --------- | -------------- |
| backend  | 30000     | 8000           |
| frontend | 30001     | 5173           |

Per `~/.claude/CLAUDE.md`, host-facing ports stay at ≥ 30000.

## Layout

```
backend/app/
  main.py            FastAPI app, CORS, router wiring, lifespan
  database.py        async engine, get_db dep, declarative Base
  core/
    config.py        Settings from env (DATABASE_URL, JWT_*, GOOGLE_*, APP_URL, FRONTEND_URL)
    security.py      bcrypt hash/verify, JWT encode/decode
    time.py          utcnow() — single source for tz-aware UTC now
    google_oauth.py  Thin Google OAuth2 client (mockable in tests)
  api/
    auth.py          POST /auth/register, /auth/login, GET /auth/google/{login,callback}
    deps.py          get_current_user (OAuth2PasswordBearer)
    contexts.py      CRUD for Contexts; google_account_id assignment
    google_accounts.py  /list, /connect (incremental OAuth), DELETE
    boards.py        CRUD; create_board seeds 3 default columns + default Context
    columns.py       CRUD + /boards/{id}/columns/reorder
    tasks.py         CRUD + /columns/{id}/tasks/reorder
    focus.py         POST /focus, GET /focus/stats (7-day series)
  models/            SQLAlchemy ORM: User, Context, GoogleAccount, Board, Column, Task, FocusSession
  schemas/           Pydantic v2 request/response models
tests/               pytest suite, in-memory SQLite

frontend/src/
  App.tsx            Auth gate + 2-view switcher (board|stats) + overlays
  main.tsx           StrictMode root
  services/api.ts    Thin fetch wrapper (credentials: 'include' for OAuth cookies)
  components/
    Auth.tsx         Login/register + "Entrar con Google" button
    Sidebar.tsx      Context pill bar + filtered board list + view switcher
    KanbanBoard.tsx  Columns + tasks; HTML5 drag&drop (no library)
    FocusTimer.tsx   Pomodoro modes; rendered as floating overlay
    QuickCapture.tsx Alt+Q modal that creates a task anywhere
    Statistics.tsx   KPIs + custom SVG bar chart (no chart lib)
    GoogleSettings.tsx  Modal: connected accounts + Context assignment

systemd/
  alfred.service     Unit template (placeholder WorkingDirectory)
  install.sh         Sudo-installer; rewrites the path for the host
```

## Domain model

```
User 1─* GoogleAccount        (personal / work / ...)
User 1─* Context              (Trabajo, Personal, Familia, ...)
   Context *─1 GoogleAccount  (optional, multiple contexts may share one)
Context 1─* Board 1─* Column 1─* Task 1─* FocusSession
                            └────────* Task (also direct FK board_id)
```

- A Context belongs to one User; a User has many. Context name is
  unique per user. "Todos" (null in the UI) is a synthetic
  no-filter; it is NOT stored.
- Board.context_id is nullable at the SQL level for the legacy DB
  migration path, but application code always assigns one. POST
  /boards without context_id lazily creates a "General" context.
- A Google account may be unattached to any context (e.g. used only
  for login). Detaching a context from a Google account uses the
  sentinel value `0` in the update body, since JSON cannot send a
  "set to null" distinct from "absent".

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

For tests, monkeypatch `app.core.google_oauth.exchange_code_for_token`
and `fetch_userinfo`. State validation is exercised directly.

## Running locally

### Whole stack via Docker

```bash
docker compose up --build
# Frontend: http://localhost:30001
# Backend:  http://localhost:30000  (Swagger at /docs)
```

The SQLite DB lives at `backend/data/alfred.db` on the host (bind mounted).

### Backend only, without Docker

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 30000
```

DB defaults to `./data/alfred.db` (relative to `backend/`).

### Frontend only, without Docker

```bash
cd frontend
npm install
npm run dev -- --port 30001
```

The dev server picks up `VITE_API_URL` (default `http://localhost:30000`).

### Tests

```bash
cd backend
uv run pytest        # 54 tests, in-memory SQLite, ~20s
```

Tests use `httpx.AsyncClient` + `ASGITransport`, so the FastAPI
lifespan does NOT run; the conftest creates tables itself. New tests
should rely on the `client` and `auth_headers` fixtures.

### Systemd (host install)

```bash
sudo systemd/install.sh
# Then: systemctl status alfred.service / journalctl -u alfred.service -f
```

The installer substitutes `__ALFRED_DIR__` in the unit with the
absolute repo path before placing it under `/etc/systemd/system`. The
unit drives `docker compose up -d --build` / `down`.

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
  `app/models/__init__.py`, and use `app.core.time.utcnow` for
  defaults — never `datetime.utcnow()`.
- After backend model changes, delete the local SQLite file — there
  are no migrations, only `create_all`.
- Frontend views are local state in `App.tsx`. Refresh is forced via
  the `refreshTrigger` counter.

## Configuration & secrets

`backend/.env.example` documents every env var. Required for the
Google flows: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`,
`FRONTEND_URL`. Without the first two, Google endpoints return 503
and the rest of the app keeps working on email/password.

Authorized redirect URI to register in Google Cloud Console:
`{APP_URL}/api/auth/google/callback`.

## Known sharp edges (not blocking, fix when relevant)

- `columns.reorder_columns` still issues one SELECT per id (N+1).
  Trivial today, bulk update if it grows. `tasks.reorder_tasks`
  already uses a single batched SELECT.
- `Quick Capture` (Alt+Q) re-fetches columns for any board it shows;
  it could share board details fetched by other views.
- JWT secret has a dev default in `app/core/config.py`. Override via
  `JWT_SECRET` env var before exposing the service outside the host.
- Refresh tokens are stored but never used yet — first Google API
  call will need a refresh-on-expiry helper around access_token.
- The `0` sentinel to detach a Google account from a Context is a
  Pydantic-driven workaround; a cleaner schema would use PATCH semantics.
