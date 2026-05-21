# Alfred 🎯

**Alfred** es un gestor personal de tareas (kanban + recordatorios + foco) pensado para usar uno mismo, sin equipos, sin SaaS. Stack ligero, despliegue en Docker o detrás de Tailscale, autenticación con Google o usuario/contraseña, y un cliente de terminal `alfred` para automatizar lo mismo que hace la web.

---

## 🌟 Características

### Organización
- **Jerarquía Usuario → Contexto → Tablero → Columna → Tarea** para separar vida personal y trabajo. Cada contexto tiene su color y su cuenta de Google asociada (opcional).
- **Tableros** con icono personalizable (emoji picker), cabecera, drag-and-drop de columnas y un menú "⋯" por tablero para renombrar / re-iconar / borrar.
- **Columnas** renombrables in-place, reordenables por drag-and-drop.
- **Tareas** con título, descripción **Markdown** (rendering en vivo + GFM), prioridad (tinta de fondo según `low` / `medium` / `high`), fecha límite, tags, requester ("Encargada por"), assignees ("Asignado a"), subtareas anidadas, recordatorios y adjuntos.
- **Subtareas** como tareas de pleno derecho con `parent_task_id`. Se renderizan como tarjeta hija con conector en L. Para anidar tareas existentes: arrastra con **Shift** sobre otra tarjeta o usa la fila "Subtarea de" en el modal.
- **Mover tareas entre tableros** dentro del mismo contexto desde el modal de detalle.
- **Archivado** por tarea o batch por columna; vista de archivadas accesible desde el menú "⋯" de la columna.
- **Búsqueda / filtros** sobre título, descripción y nombres de requester/assignees. Filtros adicionales por tags, fechas y personas. Chips activos visibles bajo la barra.

### Contactos
- Sincronización con Google People por cuenta conectada (scope `contacts.readonly`). Los contactos quedan scoped al `google_account_id` para que un mismo email pueda existir en cuentas Personal y Trabajo.
- Contacto "Yo mismo" auto-creado por usuario, con foto del primer Google account conectado, no eliminable, asignee por defecto en nuevas tareas.
- Resync idempotente: la siguiente sincronización deduplica por `google_contact_id` y reclama huérfanos.

### Recordatorios y notificaciones
- **Web Push** con VAPID + Service Worker. El backend tiene un loop que despacha los recordatorios cuyo `remind_at` ya pasó, refrescando tokens y purgando suscripciones muertas.
- **Notificaciones del navegador** locales y persistencia del estado de suscripción por dispositivo.
- Recordatorios con presets ("dentro de X minutos", "mañana 09:00") o picker custom.

### Adjuntos
- Drag-and-drop de ficheros en el modal, paste desde el portapapeles, click-to-pick.
- Imágenes: thumbnail en la tarjeta + lightbox click-to-expand.
- Documentos: badge 📎 en la tarjeta + fila con icono y descarga.
- Almacenamiento local en `data/attachments/<uuid>.<ext>`. Cap 15 MB por archivo (configurable en `backend/app/api/attachments.py`).

### Foco / Estadísticas
- Temporizador Pomodoro (25/5/15) vinculado a tarea concreta. Minimizable como floating overlay; notifica al acabar.
- Estadísticas semanales con SVG nativo (sin librerías de charting): horas enfocadas, pomodoros completados.

### Autenticación
- Email + contraseña local (bcrypt + JWT).
- **OAuth2 con Google** (sign-in + connect-additional-account). Las credenciales de Google se piden en el primer login; cuentas adicionales se conectan desde el modal de Cuentas Google.
- **Personal Access Tokens** (`alfred_pat_*`) emitibles desde la web para clientes headless (CLI, scripts, agentes IA).

### Productividad
- **Quick Capture** con `Alt + Q` desde cualquier pantalla para crear una tarea en un click.
- **Auto-save** del modal de tarea (sin botón "Guardar"); `Ctrl/Cmd + Enter` confirma y cierra.
- **Esc** cierra cualquier diálogo de la app.
- Avatar + nombre real del usuario en la sidebar tomados del primer Google account conectado (con fallback al email).

---

## 🛠️ Stack

### Backend
- **Python 3.12**, **FastAPI**, **Pydantic v2** (`UtcDatetime` annotated type para serializar siempre con sufijo `Z`).
- **SQLAlchemy 2** async con **aiosqlite**. Migraciones idempotentes en el lifespan (PRAGMA + `ALTER TABLE`).
- **PyJWT** + **bcrypt** para JWT y password hashing.
- **pywebpush** + VAPID, claves auto-generadas a `data/vapid_keys.json` si no se pasan por env.
- **uv** para gestión de deps y empaquetado.

### Frontend
- **React 19**, **Vite 8**, **TypeScript** estricto.
- **CSS vanilla** (variables HSL + glassmorphism).
- **react-markdown** + **remark-gfm** para las descripciones.
- **Service Worker** en `frontend/public/sw.js` para Web Push y notificaciones.

### CLI
- **Python 3.11+**, **uv**, **Typer**, **httpx**, **questionary** (pickers con flechas), **tomli-w**.

### Despliegue
- **Docker Compose** para dev y producción.
- **Tailscale serve** para HTTPS detrás de tailnet (probado en `melee.tail51c309.ts.net`).
- **systemd** unit en `systemd/` para arranque automático.

---

## 📁 Estructura del repo

```
alfred/
├── backend/                FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── api/            Endpoints (auth, boards, tasks, attachments, ...)
│   │   ├── core/           OAuth, push, time helpers, self_contact
│   │   ├── models/         SQLAlchemy mappers
│   │   └── schemas/        Pydantic v2 in/out
│   ├── data/               SQLite + attachments (gitignored)
│   ├── scripts/            Utilidades one-off (cleanup_google_contacts.py)
│   └── tests/              124 tests (pytest-asyncio)
├── frontend/               React + Vite SPA
│   ├── src/components/     Sidebar, KanbanBoard, FocusTimer, ...
│   ├── src/hooks/          useEscapeKey, useAuthedImage
│   ├── src/services/api.ts API client (single-origin /api/*)
│   └── public/sw.js        Service Worker (Web Push)
├── cli/                    Cliente Alfred CLI (uv project)
│   ├── pyproject.toml
│   └── src/alfred_cli/
├── data/                   Bind-mount para attachments/db en producción
├── docker-compose.yml
├── systemd/                Unit + script de instalación
├── AGENTS.md               Notas para agentes IA
└── README.md
```

---

## 🚀 Quickstart (Docker)

```bash
git clone <repo>
cd alfred
cp backend/.env.example backend/.env       # rellena GOOGLE_CLIENT_ID etc. si quieres OAuth
docker compose up --build
```

Una vez levantado:

| Servicio   | URL local                  | Puerto contenedor |
|------------|----------------------------|-------------------|
| Frontend   | http://localhost:30001     | 5173 (Vite dev)   |
| Backend    | http://localhost:30000     | 8000 (FastAPI)    |
| Swagger    | http://localhost:30000/docs| 8000              |

El SPA habla con `/api/*` en el mismo origen vía el proxy de Vite (`vite.config.ts`), así que cookies/CORS no son problema.

### Variables relevantes (`backend/.env`)

```bash
# OAuth (opcional — sin esto se desactiva el botón "Continuar con Google")
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# URLs del despliegue
APP_URL=https://alfred.example.com
FRONTEND_URL=https://alfred.example.com
CORS_ORIGIN_REGEX=^https://.*\.tail.*\.ts\.net$

# Web Push (opcional — si no, se autogenera y persiste a data/vapid_keys.json)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu@email.com

# JWT
JWT_SECRET=cambia-esto
```

---

## 🔐 Autenticación

Hay tres formas:

1. **Email + contraseña local**: registro vía `/auth/register` o el formulario del SPA.
2. **Google OAuth2**: configura `GOOGLE_CLIENT_ID/SECRET` y pulsa "Continuar con Google". El primer login con un email desconocido crea un User sin contraseña.
3. **Personal Access Tokens**: desde el perfil de la web, "Tokens API" → "Crear token". Los tokens nacen con prefijo `alfred_pat_` y se muestran una sola vez. Úsalos para clientes headless (CLI, automations).

---

## 🖥️ Cliente CLI

El CLI vive en `cli/` y se gestiona con `uv`. Mira `cli/README.md` para detalles completos.

### Setup

```bash
cd cli
uv sync                              # instala deps
uv tool install .                    # opcional: alfred en el PATH
alfred config set-api-url https://alfred.example.com
alfred config set-token alfred_pat_...
alfred set-default context Trabajo   # o se elige interactivamente
alfred set-default board Backlog
```

Si no configuras defaults, los comandos preguntan con un picker de flechas.

### Comandos

```bash
alfred --help                         # árbol entero documentado para agentes IA
alfred context list
alfred board list [--context ID]
alfred task list [--board ID] [--include-done]

alfred task add "Comprar pan"
alfred task add "Tarea con detalles" \
  --description "**Markdown** soportado" \
  --priority high --due 2026-06-01 --column "En Proceso"

# Edición arbitraria con JSON (cada --help documenta los campos aceptados):
alfred task edit 42 --json '{"priority": "high", "tag_ids": [3, 7]}'
alfred board edit 5 --json '{"icon": "🎯"}'
alfred context edit 2 --json '{"color": "#10b981"}'

# Recordatorios — acepta ISO, local, o Unix epoch (s o ms):
alfred task add-reminder 42 2026-06-01T09:00:00Z
alfred task add-reminder 42 1780000000

# Completions del shell (autodetecta $SHELL):
alfred add-completions
```

El CLI ignora certificados self-signed por defecto (`verify_ssl = false` en `cli/config.toml`) para que funcione contra Tailscale sin más.

---

## 🧪 Tests

```bash
cd backend
uv run pytest                # 124 tests, ~54s
```

No hay suite del frontend; la verificación es manual + typecheck (`tsc -b` dentro del contenedor frontend).

---

## 🛠️ Mantenimiento

### Limpiar duplicados de contactos sincronizados

Si tras una migración aparecen contactos duplicados de Google:

```bash
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --list
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --account-id 1 --dry-run
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --account-id 1

# Variante nuclear (borra TODO menos "Yo mismo"):
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --all
```

Tras eso, vuelve a sincronizar desde la UI. El upsert idempotente del backend no volverá a duplicar.

### Despliegue con systemd

```bash
sudo bash systemd/install.sh         # copia la unit y la habilita
sudo systemctl status alfred
```

La unit hace `docker compose up -d` sobre la raíz del proyecto.

---

## 📚 Referencia API

Swagger interactivo en `/docs` (FastAPI). Los endpoints principales:

```
POST   /api/auth/register             POST   /api/auth/login
GET    /api/auth/google/login         GET    /api/auth/google/callback

GET    /api/contexts                  POST   /api/contexts
PUT    /api/contexts/{id}             DELETE /api/contexts/{id}

GET    /api/boards?context_id=        POST   /api/boards
GET    /api/boards/{id}               PUT    /api/boards/{id}      DELETE /api/boards/{id}
POST   /api/boards/{id}/columns       POST   /api/boards/{id}/columns/reorder

POST   /api/columns/{id}/tasks        POST   /api/columns/{id}/tasks/reorder
POST   /api/columns/{id}/archive-all  GET    /api/columns/{id}/archived-tasks

GET    /api/tasks/{id}                PUT    /api/tasks/{id}       DELETE /api/tasks/{id}
POST   /api/tasks/{id}/move           POST   /api/tasks/{id}/subtasks
POST   /api/tasks/{id}/reminders      POST   /api/tasks/{id}/attachments

GET    /api/attachments/{id}          DELETE /api/attachments/{id}
GET    /api/reminders/pending         DELETE /api/reminders/{id}

GET    /api/contacts                  POST   /api/contacts
PUT    /api/contacts/{id}             DELETE /api/contacts/{id}

GET    /api/google-accounts           POST   /api/google-accounts/connect
DELETE /api/google-accounts/{id}      POST   /api/google-accounts/{id}/sync-contacts

GET    /api/tags                      POST   /api/tags             ...
POST   /api/focus                     GET    /api/focus/stats
GET    /api/push/vapid-public-key     POST   /api/push/subscribe   POST /api/push/unsubscribe
GET    /api/pats                      POST   /api/pats             DELETE /api/pats/{id}
```

---

## 📝 Licencia

Personal — un solo usuario, sin compromisos de soporte. Úsalo, fórkalo, rómpelo.
