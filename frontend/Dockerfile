# Production image: build the SPA, then serve the static bundle with nginx.
# The dev server (vite) must never face the internet — it serves the whole
# source tree and treats extensionless paths as JS modules. Use
# Dockerfile.dev + docker-compose.dev.yml for local development.

# ---- build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy package descriptors first so the install layer caches on lockfile hits.
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source
COPY . .

# Type-checks (tsc -b) and bundles into /app/dist.
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
