from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.api.auth import router as auth_router
from app.api.boards import router as boards_router
from app.api.columns import router as columns_router
from app.api.tasks import router as tasks_router
from app.api.focus import router as focus_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize SQLite database tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Dispose of engine connection pool on shutdown
    await engine.dispose()

app = FastAPI(
    title="Alfred API",
    description="Sleek personal task manager API backend",
    version="1.0.0",
    lifespan=lifespan
)

import os

# CORS middleware. Allow-credentials + wildcard origins is invalid per
# the CORS spec, so we list dev origins explicitly. Extend via env.
_default_origins = "http://localhost:5173,http://localhost:30001,http://127.0.0.1:5173,http://127.0.0.1:30001"
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wire up routers
app.include_router(auth_router, prefix="/api")
app.include_router(boards_router, prefix="/api")
app.include_router(columns_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(focus_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Alfred API. Visit /docs for interactive Swagger documentation."}
