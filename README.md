# Alfred 🎯

**Alfred** es un gestor de tareas y productividad personal minimalista y altamente visual. Diseñado con una interfaz *premium* basada en **Glassmorphic UI** y modo oscuro nativo, Alfred simplifica tu vida diaria permitiéndote organizar tu tiempo por espacios o proyectos, controlar tu concentración y analizar tu rendimiento semanal sin distracciones de equipo.

---

## 🌟 Características Clave

1. **Estructura Multi-Tablero**: Organiza tu vida en espacios (ej. *Curro*, *Familia*, *Proyectos Personales*) con columnas de estado personalizables.
2. **Kanban Interactivo con Drag & Drop**: Arrastra y suelta tarjetas entre estados de forma fluida con micro-transiciones.
3. **Temporizador de Enfoque Pomodoro**: Reloj integrado con presets de 25m, 5m y 15m vinculado a tareas individuales para medir y guardar tus tiempos.
4. **Captura Rápida (Quick Capture)**: Presiona `Alt + Q` desde cualquier lugar de la aplicación para registrar una idea en segundos sin tocar el ratón.
5. **Panel de Estadísticas**: Gráficos semanales nativos en formato SVG que muestran tus horas enfocadas y Pomodoros completados sin librerías pesadas.

---

## 🛠️ Tecnologías

### Backend
- **Python 3.12** + **FastAPI**
- **uv** (para gestión ultra-rápida de dependencias y empaquetado)
- **SQLAlchemy** (acceso asíncrono ORM)
- **SQLite** (persistencia rápida, ligera y portable)
- **PyJWT & bcrypt** (autenticación segura mediante tokens)

### Frontend
- **React 18** + **Vite** + **TypeScript**
- **Vanilla CSS** (sistema de diseño premium con variables de color HSL y Glassmorphism)

### Despliegue
- **Docker Compose**

---

## 🚀 Despliegue Rápido (Docker)

Solo necesitas tener instalado [Docker](https://www.docker.com/) y [Docker Compose](https://docs.docker.com/compose/).

### 1. Clonar e Iniciar el Stack

Ejecuta el siguiente comando en la raíz del proyecto:

```bash
docker compose up --build
```

Este comando:
- Instalará las dependencias en ambos contenedores de forma limpia.
- Creará la base de datos SQLite persistente en `backend/data/alfred.db`.
- Levantará el **Frontend** en `http://localhost:5173`.
- Levantará el **Backend** en `http://localhost:8000`.

### 2. Acceso

- **Aplicación Web**: Abre [http://localhost:5173](http://localhost:5173) en tu navegador.
- **Documentación API (Swagger)**: Si quieres probar los endpoints de FastAPI interactivamente, ve a [http://localhost:8000/docs](http://localhost:8000/docs).
