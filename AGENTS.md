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
- **Auth**: email + password, bcrypt-hashed; JWT bearer tokens.
  Personal prototype — Google OAuth2 is intentionally out of scope.

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
    config.py        Settings from env (DATABASE_URL, JWT_*)
    security.py      bcrypt hash/verify, JWT encode/decode
    time.py          utcnow() — single source for tz-aware UTC now
  api/
    auth.py          POST /auth/register, /auth/login
    deps.py          get_current_user (OAuth2PasswordBearer)
    boards.py        CRUD; create_board seeds 3 default columns
    columns.py       CRUD + /boards/{id}/columns/reorder
    tasks.py         CRUD + /columns/{id}/tasks/reorder
    focus.py         POST /focus, GET /focus/stats (7-day series)
  models/            SQLAlchemy ORM: User, Board, Column, Task, FocusSession
  schemas/           Pydantic v2 request/response models
tests/               pytest suite, in-memory SQLite

frontend/src/
  App.tsx            Auth gate + 3-view switcher (board|focus|stats)
  main.tsx           StrictMode root
  services/api.ts    Thin fetch wrapper; token in localStorage
  components/
    Auth.tsx         Login/register
    Sidebar.tsx      Board list + view switcher
    KanbanBoard.tsx  Columns + tasks; HTML5 drag&drop (no library)
    FocusTimer.tsx   Pomodoro modes; WebAudio chime
    QuickCapture.tsx Alt+Q modal that creates a task anywhere
    Statistics.tsx   KPIs + custom SVG bar chart (no chart lib)

systemd/
  alfred.service     Unit template (placeholder WorkingDirectory)
  install.sh         Sudo-installer; rewrites the path for the host
```

## Domain model

```
User 1─* Board 1─* Column 1─* Task 1─* FocusSession
                        └────────* Task (also direct FK board_id)
```

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
uv run pytest        # 25 tests, in-memory SQLite, ~10s
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

## Known sharp edges (not blocking, fix when relevant)

- `Reorder N+1`: `columns.reorder_columns` and `tasks.reorder_tasks`
  issue one SELECT per id. Trivial today, bulk update if it grows.
- Pydantic v2 deprecation warnings about class-based `Config` show
  up in `pytest` runs. Mechanical migration to
  `model_config = ConfigDict(from_attributes=True)`.
- The drop handler in `KanbanBoard.handleDrop` only changes
  `column_id` — it does not call the `tasks/reorder` endpoint that
  exists. So intra-column order is not preserved across drops.
- `Quick Capture` (Alt+Q) re-fetches columns for any board it shows;
  it could share board details fetched by other views.
- JWT secret has a dev default in `app/core/config.py`. Override via
  `JWT_SECRET` env var before exposing the service outside the host.
