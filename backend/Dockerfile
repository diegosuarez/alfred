FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy project configuration files
COPY pyproject.toml uv.lock ./

# Install dependencies using uv caching
RUN uv sync --frozen --no-install-project

# Copy the rest of the application code
COPY . .

# Ensure data directory for SQLite exists
RUN mkdir -p /app/data

# Sync the project
RUN uv sync --frozen

EXPOSE 8000

# Default command (overridden in docker-compose.yml for dev, but good for production)
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
