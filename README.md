# Alfred 🎯

**Alfred** es un gestor personal de tareas (kanban + recordatorios + foco) pensado para usar uno mismo, sin equipos, sin SaaS. Tres clientes hablan con el mismo backend:

- **Web SPA** (React + Vite) — la interfaz principal.
- **App Android nativa** (Kotlin + Jetpack Compose) — desbloqueo con huella, notificaciones push FCM.
- **CLI `alfred`** (Python + Typer) — automatización, scripting, agentes IA.

Despliegue en Docker o detrás de Tailscale. Autenticación con Google, email/contraseña, **passkeys** (WebAuthn) o Personal Access Tokens.

---

## 🌟 Características

### Organización
- **Jerarquía Usuario → Contexto → Tablero → Columna → Tarea** para separar vida personal y trabajo. Cada contexto tiene su color y su cuenta de Google asociada (opcional).
- **Tableros** con icono emoji personalizable, drag-and-drop de columnas, ancho de columna dinámico (1 lista → 2× ancho; muchas listas → scroll horizontal con `minWidth: 0` a través del árbol de flex).
- **Columnas** renombrables in-place, reordenables por drag-and-drop.
- **Tareas** con título, descripción Markdown (GFM), prioridad (tinta de fondo por nivel), fecha límite, tags, requester ("Encargada por"), assignees ("Asignado a"), subtareas anidadas, recordatorios y adjuntos.
- **Subtareas** como tareas de pleno derecho con `parent_task_id`. Para anidar tareas existentes: Shift+drag sobre otra tarjeta, o la fila "Subtarea de" en el modal.
- **Mover tareas entre tableros** del mismo contexto desde el detalle.
- **Archivado** por tarea o batch por columna; vista de archivadas accesible desde el menú "⋯".
- **Búsqueda / filtros** por texto (título, descripción, requester, assignees), tags, fechas y personas. Chips activos visibles bajo la barra.

### Contactos
- Sincronización con Google People por cuenta conectada (scope `contacts.readonly`). Los contactos quedan scoped al `google_account_id` para que un mismo email pueda existir en cuentas Personal y Trabajo.
- Contacto "Yo mismo" auto-creado por usuario, con foto del primer Google account, no eliminable, assignee por defecto.
- Resync idempotente: deduplica por `google_contact_id` y reclama huérfanos.
- **Buscador y filtro de favoritos** en la pantalla de gestión (útil con >400 contactos).
- **Selector con búsqueda** (dropdown + dialog) al asignar contactos a tareas — favoritos al tope, búsqueda por nombre / email.

### Recordatorios y notificaciones
- **Web Push** con VAPID + Service Worker. Las claves VAPID se persisten como **base64url DER PKCS8** (formato a prueba de cambios de py_vapid) en `data/vapid_keys.json` y se autogeneran si no existen.
- **FCM** para la app Android. El dispatcher fan-outs a Web Push **y** FCM en paralelo; un sub muerto no impide la entrega al resto.
- Recordatorios con presets ("dentro de X minutos", "mañana 09:00") o picker custom. Funcionan cross-device: lo creas en cualquier cliente, llega a todos los demás.

### Adjuntos
- Web: drag-and-drop, paste desde portapapeles, click-to-pick. Imágenes con thumbnail + lightbox; documentos con badge 📎.
- Móvil: file picker del sistema desde el detalle de tarea.
- Almacenamiento local en `data/attachments/<uuid>.<ext>`. Cap 15 MB por archivo.

### Foco / Estadísticas
- Pomodoro (15/25/50 min) vinculado a tarea concreta. En web es un floating overlay minimizable; en móvil pantalla dedicada con countdown circular.
- Estadísticas: tiempo total + sesiones completadas + gráfica de barras diarias. Aggregadas server-side, **consistentes entre dispositivos**.

### Autenticación
- **Email + contraseña local** (bcrypt + JWT).
- **OAuth2 con Google** en web (sign-in + connect-additional-account).
- **Google Sign-In nativo** en Android (Credential Manager + verificación de ID token en backend).
- **Passkeys / WebAuthn** en web (discoverable credentials — sin email; el navegador ofrece directamente las passkeys registradas).
- **Desbloqueo con huella** en Android (JWT cifrado con AES-GCM bajo clave biométrica del Android Keystore).
- **Personal Access Tokens** (`alfred_pat_*`) para clientes headless (CLI, automations, agentes IA).
- **Auto-redirect a login al caducar sesión**: cualquier 401 mid-session en endpoints autenticados limpia el token y vuelve al formulario, sin pantallas zombies ni hard refresh.

### Productividad
- **Quick Capture** con `Alt + Q` desde cualquier pantalla (web).
- **Auto-save** del modal de tarea (sin botón "Guardar"); `Ctrl/Cmd + Enter` confirma y cierra.
- **Esc** cierra cualquier diálogo.
- Avatar + nombre real del usuario en la sidebar, tomados del primer Google account conectado (fallback al email).

---

## 🛠️ Stack

### Backend
- **Python 3.12**, **FastAPI**, **Pydantic v2** (`UtcDatetime` annotated type → siempre serializa con sufijo `Z`).
- **SQLAlchemy 2** async con **aiosqlite**. Migraciones idempotentes en lifespan (PRAGMA + ALTER TABLE + table rebuild cuando hace falta quitar constraints anónimos).
- **PyJWT** + **bcrypt** para JWT y password hashing.
- **pywebpush** + VAPID para notificaciones del navegador.
- **firebase-admin** para FCM (push al móvil).
- **webauthn** (`>=2.5`) para passkeys.
- **google-auth** + verificación remota de ID tokens.
- **uv** para gestión de deps y empaquetado.

### Frontend
- **React 19**, **Vite 8**, **TypeScript** estricto.
- **CSS vanilla** (variables HSL + glassmorphism).
- **react-markdown** + **remark-gfm** para descripciones.
- **Service Worker** en `frontend/public/sw.js` (Web Push + clic en notificación).
- **WebAuthn helpers** propios en `src/services/webauthn.ts` (base64url ↔ ArrayBuffer + flujos).

### Android
- **Kotlin 2.0**, **Jetpack Compose** (BOM 2024.12, Material 3), **min SDK 26 / target 35**.
- **Retrofit 2** + **OkHttp** + **kotlinx-serialization** para HTTP.
- **DataStore** para preferencias (URL, token, defaults).
- **Coil 3** para imágenes (con bearer token vía hook custom).
- **Firebase Messaging** + **Credential Manager + googleid** para FCM y Google Sign-In nativo.
- **androidx.biometric** + Android Keystore para desbloqueo con huella.
- **compose-markdown** (`jeziellago/compose-markdown` vía JitPack) para Markdown.

### CLI
- **Python 3.11+**, **uv**, **Typer**, **httpx**, **questionary** (pickers), **tomli-w**.

### Despliegue
- **Docker Compose** para dev y producción.
- **nginx** + **certbot** delante para HTTPS público (script `deploy/deploy.sh`).
- **Tailscale serve** para HTTPS dentro del tailnet.
- **systemd** unit en `systemd/` para arranque automático.

---

## 📁 Estructura del repo

```
alfred/
├── backend/                FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── api/            Endpoints (auth, boards, tasks, attachments, passkeys, ...)
│   │   ├── core/           OAuth, push (Web/FCM), time, self_contact
│   │   ├── models/         SQLAlchemy mappers
│   │   └── schemas/        Pydantic v2 in/out
│   ├── data/               SQLite + attachments + vapid_keys.json + fcm_service_account.json (gitignored)
│   ├── scripts/            Mantenimiento (cleanup_google_contacts.py)
│   └── tests/              124 tests (pytest-asyncio)
├── frontend/               React + Vite SPA
│   ├── src/components/     Sidebar, KanbanBoard, Auth, TokensSettings, ...
│   ├── src/hooks/          useEscapeKey, useAuthedImage
│   ├── src/services/       api.ts (single-origin /api/*), webauthn.ts, push.ts
│   └── public/sw.js        Service Worker (Web Push)
├── android/                App nativa Kotlin + Compose
│   ├── Dockerfile          Builder reproducible del APK
│   ├── app/                Módulo Android (manifest, res, kotlin/, build.gradle.kts)
│   ├── docker-entrypoint.sh
│   └── README.md           Detalle del setup Firebase + Google + SHA-1
├── cli/                    Cliente CLI (uv project)
│   ├── pyproject.toml
│   ├── src/alfred_cli/
│   └── README.md
├── deploy/                 Despliegue público
│   ├── deploy.sh           Script idempotente (nginx + certbot + compose up)
│   └── nginx/              Vhost de ejemplo
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
cp backend/.env.example backend/.env       # rellena GOOGLE_CLIENT_ID etc.
docker compose up --build
```

Una vez levantado:

| Servicio   | URL local                  | Puerto contenedor |
|------------|----------------------------|-------------------|
| Frontend   | http://localhost:30001     | 5173 (Vite dev)   |
| Backend    | http://localhost:30000     | 8000 (FastAPI)    |
| Swagger    | http://localhost:30000/docs| 8000              |

El SPA habla con `/api/*` en el mismo origen vía el proxy de Vite, así que cookies/CORS no son problema.

### Variables relevantes (`backend/.env`)

```bash
# JWT
JWT_SECRET=cambia-esto

# URLs del despliegue
APP_URL=https://alfred.example.com
FRONTEND_URL=https://alfred.example.com
CORS_ORIGIN_REGEX=^https://.*\.tail.*\.ts\.net$    # opcional, para Tailscale en paralelo

# Google OAuth2 (web — sign-in + connect-account)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Audiencias adicionales aceptadas en /api/auth/google/native (móvil)
GOOGLE_NATIVE_AUDIENCES=274719...-xxxxx.apps.googleusercontent.com

# Web Push (opcional — si no, se autogenera y persiste a data/vapid_keys.json)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu@email.com

# Passkeys (opcional — fallback al hostname de APP_URL si vacíos)
WEBAUTHN_RP_ID=alfred.example.com
WEBAUTHN_ORIGIN=https://alfred.example.com
WEBAUTHN_RP_NAME=Alfred

# FCM (sólo si quieres push al móvil — descarga del Firebase Console)
FCM_SERVICE_ACCOUNT_JSON_PATH=data/fcm_service_account.json
```

### Despliegue público con dominio + TLS

`deploy/deploy.sh` automatiza el setup:

```bash
sudo bash deploy/deploy.sh   # usa ALFRED_DIR=/opt/alfred por defecto
```

El script: valida DNS, instala/recarga el vhost nginx, pide cert Let's Encrypt vía webroot, levanta el stack y hace smoke test.

---

## 🔐 Autenticación

Cinco formas en la web:

1. **Email + contraseña** local.
2. **Google OAuth2** (web flow con redirect).
3. **Passkeys / WebAuthn**: en "Tokens API → Passkeys" registras una; en la pantalla de login pulsas "🔐 Entrar con passkey". El navegador te ofrece las passkeys de este dispositivo, autenticas con biometría/PIN, el backend verifica la firma y emite el JWT. Sin email previo.
4. **Personal Access Tokens** (`alfred_pat_*`) para clientes headless.
5. **Sesión persistente** (JWT en `localStorage`). Caduca a las 24h; en cualquier 401 mid-session, el SPA vuelve automáticamente al login.

Cuatro formas en Android:

1. **PAT** (más rápido para empezar).
2. **Email + contraseña**.
3. **Google Sign-In nativo** (Credential Manager → ID token → `/api/auth/google/native`).
4. **Desbloqueo con huella** tras un primer login. El JWT se cifra con AES-GCM bajo una clave del Android Keystore con `setUserAuthenticationRequired(true)`. Si la huella se invalida (añades/quitas una), Android revoca la clave y se cae al login manual.

---

## 🖥️ Cliente CLI

Vive en `cli/`. Ver `cli/README.md`.

```bash
cd cli
uv sync
uv tool install .                    # opcional: alfred en el PATH

alfred config set-api-url https://alfred.example.com
alfred config set-token alfred_pat_...
alfred set-default context Trabajo
alfred set-default board Backlog

alfred task add "Comprar pan"
alfred task list
alfred task edit 42 --json '{"priority": "high", "tag_ids": [3, 7]}'
alfred task add-reminder 42 1780000000   # acepta epoch, ISO o local

alfred add-completions                # bash / fish / zsh, autodetectado
```

Si no configuras defaults, los comandos preguntan con un picker de flechas.

El CLI ignora certs self-signed por defecto (`verify_ssl = false` en `cli/config.toml`) para que funcione contra Tailscale sin más.

---

## 📱 App Android

Ver `android/README.md` para los pasos de Firebase, SHA-1 y Google Cloud.

```bash
cd android
docker build -f Dockerfile -t alfred-android-build .
docker run --rm -v "$PWD:/work" -u "$(id -u):$(id -g)" alfred-android-build
# APK en android/app/build/outputs/apk/debug/app-debug.apk
```

Configuración crítica:

- `android/local.properties` (gitignored): `google.webClientId=...` (Web client del proyecto Firebase) y `alfred.apiUrl=https://...`.
- `android/app/google-services.json`: descargado de Firebase Console.
- `backend/data/fcm_service_account.json`: descargado de Firebase Service Accounts.

La app incluye:
- Login (PAT / email / Google nativo / desbloqueo huella).
- Drawer con contextos coloreados; cambiar contexto re-tinta el fondo.
- Tableros con icono + descripción.
- Lista de tareas con tabs por columna, search bar, barra vertical de prioridad, cover image, avatars apilados, badges (subtareas, recordatorios, adjuntos, fecha).
- Detalle: editar título / Markdown / prioridad / tags / requester / assignees / recordatorios / subir adjunto / mover de tablero / archivar / borrar.
- Pomodoro con countdown circular y stats con barras diarias.
- Perfil: gestión de PATs + cuentas Google (sincronizar contactos, desconectar, conectar nueva).
- FCM: registro automático del token, notificaciones push al recibir recordatorios.

---

## 🧪 Tests

```bash
cd backend
uv run pytest                # 124 tests, ~80s
```

No hay suite del frontend; verificación manual + typecheck (`tsc -b`).

---

## 🛠️ Mantenimiento

### Sincronización de contactos duplicados

Si tras una migración aparecen duplicados:

```bash
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --list
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --account-id 1 --dry-run
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --account-id 1

# Variante nuclear (borra TODO menos "Yo mismo"):
docker compose exec backend uv run python scripts/cleanup_google_contacts.py --all
```

Luego vuelve a sincronizar desde la UI. El upsert idempotente no volverá a duplicar.

### VAPID corrupto

Síntoma: el loop de reminders crashea con `ValueError: Could not deserialize key data` desde `py_vapid`. Fix:

```bash
docker compose exec backend uv run python -c "
import sqlite3; db = sqlite3.connect('/app/data/alfred.db')
print('Borradas', db.execute('DELETE FROM push_subscriptions').rowcount, 'suscripciones')
db.commit()
"
sudo rm /opt/alfred/backend/data/vapid_keys.json
docker compose restart backend
```

Después re-acepta las notificaciones en el navegador. El backend genera la nueva clave en formato base64url DER PKCS8 (a prueba de cambios entre versiones de py_vapid).

### FCM no llega al móvil

Comprueba en orden:

```bash
ls -la /opt/alfred/backend/data/fcm_service_account.json   # debe existir y ser JSON válido
head -c 1 /opt/alfred/backend/data/fcm_service_account.json
# debería imprimir '{' — si imprime otra cosa, descarga otra vez

docker compose exec backend uv run python -c "
import sqlite3; db = sqlite3.connect('/app/data/alfred.db')
print(list(db.execute('SELECT id, user_id, device_label FROM fcm_subscriptions')))
"
# Si vacío, la app no llegó a registrar su token: abre la app logueado y mira logs.

docker compose logs backend --since 5m | grep -iE "reminder|fcm|push"
```

### Despliegue con systemd

```bash
sudo bash systemd/install.sh
sudo systemctl status alfred
```

La unit hace `docker compose up -d` sobre la raíz del proyecto.

---

## 📚 Referencia API

Swagger interactivo en `/docs`. Endpoints principales:

```
# Auth
POST   /api/auth/register             POST   /api/auth/login
GET    /api/auth/google/login         GET    /api/auth/google/callback
POST   /api/auth/google/native        # móvil: intercambia ID token por JWT

# Passkeys (WebAuthn)
POST   /api/passkeys/register/begin   POST   /api/passkeys/register/finish
POST   /api/passkeys/login/begin      POST   /api/passkeys/login/finish
GET    /api/passkeys                  DELETE /api/passkeys/{id}

# Contextos / Tableros / Columnas
GET    /api/contexts                  POST   /api/contexts
PUT    /api/contexts/{id}             DELETE /api/contexts/{id}
GET    /api/boards?context_id=        POST   /api/boards
GET    /api/boards/{id}               PUT    /api/boards/{id}      DELETE /api/boards/{id}
POST   /api/boards/{id}/columns       POST   /api/boards/{id}/columns/reorder

# Tareas / Subtareas / Adjuntos / Recordatorios
POST   /api/columns/{id}/tasks        POST   /api/columns/{id}/tasks/reorder
POST   /api/columns/{id}/archive-all  GET    /api/columns/{id}/archived-tasks
GET    /api/tasks/{id}                PUT    /api/tasks/{id}       DELETE /api/tasks/{id}
POST   /api/tasks/{id}/move           POST   /api/tasks/{id}/subtasks
POST   /api/tasks/{id}/reminders      POST   /api/tasks/{id}/attachments
GET    /api/attachments/{id}          DELETE /api/attachments/{id}
GET    /api/reminders/pending         DELETE /api/reminders/{id}

# Contactos / Cuentas Google
GET    /api/contacts                  POST   /api/contacts
PUT    /api/contacts/{id}             DELETE /api/contacts/{id}
GET    /api/google-accounts           POST   /api/google-accounts/connect
DELETE /api/google-accounts/{id}      POST   /api/google-accounts/{id}/sync-contacts

# Foco / Push / Tags / PATs
POST   /api/focus                     GET    /api/focus/stats
GET    /api/push/vapid-public-key     POST   /api/push/subscribe   POST /api/push/unsubscribe
POST   /api/push/fcm/subscribe        POST   /api/push/fcm/unsubscribe
GET    /api/tags                      POST   /api/tags             ...
GET    /api/pats                      POST   /api/pats             DELETE /api/pats/{id}
```

---

## 📝 Licencia

Personal — un solo usuario, sin compromisos de soporte. Úsalo, fórkalo, rómpelo.
