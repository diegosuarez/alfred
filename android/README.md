# Alfred Android

Cliente nativo Kotlin + Jetpack Compose para Alfred. Login con PAT, email/contraseña o Google nativo. Recordatorios vía Firebase Cloud Messaging.

## Build del APK (Docker)

```bash
cd android
docker build -f Dockerfile -t alfred-android-build .
docker run --rm -v "$PWD:/work" -u "$(id -u):$(id -g)" alfred-android-build
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Instálalo con `adb install` o pásalo al móvil.

> La primera build descarga el SDK + Gradle (~1.5 GB en el container). Las siguientes son rápidas.

## Configuración (pasos manuales)

Para que **Google Sign-In nativo** y **FCM** funcionen necesitas registrar la app en Google Cloud + Firebase:

### 1. Firebase + FCM

1. Crea un proyecto en https://console.firebase.google.com (puedes reusar uno existente del Cloud Console).
2. Añade una app Android con package name `es.tcdn.diego.alfred`.
3. Pega la huella SHA-1 del keystore. Para el keystore de debug:
   ```bash
   keytool -list -v -alias androiddebugkey \
     -keystore ~/.android/debug.keystore \
     -storepass android -keypass android | grep SHA1
   ```
4. Descarga `google-services.json` y reemplaza el placeholder en `android/app/google-services.json`.
5. En la sección Cloud Messaging del proyecto Firebase, abre "Service accounts" y descarga el JSON. Cópialo a `backend/data/fcm_service_account.json` (o exporta `FCM_SERVICE_ACCOUNT_JSON_PATH=/ruta/a/tu.json`).

### 2. Google Sign-In nativo

Firebase ya te crea un OAuth client de tipo Android al subir la SHA-1. Necesitas el **web client id** (no el Android) — está en Google Cloud Console → APIs & Services → Credentials, dentro del mismo proyecto Firebase, con tipo "Web application".

Crea `android/local.properties` (no commited):

```properties
google.webClientId=000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
alfred.apiUrl=https://alfred.example.com
```

Añade ese web client id a la lista de audiencias aceptadas en el backend:

```bash
# backend/.env
GOOGLE_NATIVE_AUDIENCES=000000000000-xxxxx.apps.googleusercontent.com
```

Sin esta variable, el endpoint `/api/auth/google/native` rechaza los tokens emitidos para clientes Android.

### 3. Verifica el backend

El backend debe tener:
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (el web client) — ya configurado si la web funciona.
- `GOOGLE_NATIVE_AUDIENCES` añadido.
- `data/fcm_service_account.json` presente si quieres FCM.

Reinicia el backend tras editar `.env` o el JSON.

## Pruebas sin Google ni FCM

La app arranca y funciona con sólo PAT. Si `google-services.json` es el placeholder o `google.webClientId` está vacío:
- El botón "Entrar con Google" no aparece en login.
- FCM no se inicializa; los recordatorios no llegarán al móvil (sí seguirán llegando al navegador vía Web Push).

## Estructura

```
android/
├── Dockerfile                    Builder reproducible del APK
├── settings.gradle.kts
├── build.gradle.kts              Versiones de plugins
├── gradle.properties
├── gradle/wrapper/...            Configuración del wrapper
└── app/
    ├── build.gradle.kts          Deps + buildConfigField (api url, google client id)
    ├── google-services.json      Placeholder; reemplaza con tu Firebase config
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/                  Iconos, theme, strings
        └── kotlin/es/tcdn/diego/alfred/
            ├── AlfredApp.kt      Application class + canal de notificación
            ├── MainActivity.kt   Setea el theme + lanza el NavHost
            ├── auth/             LoginScreen + Google Sign-In helper
            ├── data/             Retrofit + Models + Settings (DataStore)
            ├── push/             Servicio FCM + registro de token con el backend
            └── ui/
                ├── theme/        Material 3 dark próximo al glass de la web
                ├── nav/          NavHost (login → boards → tasks → detail)
                ├── boards/       Lista de tableros agrupados por contexto
                ├── tasks/        Lista de tareas + add + detail con Markdown
                └── settings/     URL backend + token + cerrar sesión
```

## Alcance v1

✅ Login PAT / email / Google nativo
✅ Listar contextos, tableros, tareas
✅ Crear tarea (mínima — sólo título)
✅ Marcar tarea completada (checkbox)
✅ Detalle: editar título y descripción (Markdown), preview de imágenes adjuntas
✅ FCM: token registrado con el backend; notificación al recibir recordatorio

❌ Edición avanzada (tags, assignees, recordatorios desde la app)
❌ Subir adjuntos desde el móvil
❌ Subtareas / contextos múltiples / filtros / archivo

Esos pendientes se iteran sobre esta base.
