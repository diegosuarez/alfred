#!/usr/bin/env bash
# Bring up Alfred at alfred.diego.tcdn.es on this host.
#
# Assumes:
#   - Repo cloned at /opt/alfred (override with ALFRED_DIR=).
#   - Docker + docker compose plugin installed.
#   - nginx + certbot installed (apt: nginx, certbot, python3-certbot-nginx).
#   - DNS for alfred.diego.tcdn.es already pointing at this host.
#
# Idempotent: safe to re-run after editing .env or after a `git pull`.
#
# Usage:
#   sudo bash deploy/deploy.sh
#   sudo ALFRED_DIR=/opt/alfred bash deploy/deploy.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo $0)" >&2
    exit 1
fi

ALFRED_DIR="${ALFRED_DIR:-/opt/alfred}"
DOMAIN="alfred.diego.tcdn.es"
LE_EMAIL="${LE_EMAIL:-dsuarez@transparentedge.eu}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------------------
log "Sanity checks"
# ---------------------------------------------------------------------------
[[ -d "$ALFRED_DIR" ]] || { echo "Missing $ALFRED_DIR — clone the repo there first." >&2; exit 1; }
command -v docker >/dev/null || { echo "Install docker first."; exit 1; }
command -v nginx >/dev/null  || { echo "Install nginx first (apt install nginx)."; exit 1; }
command -v certbot >/dev/null || { echo "Install certbot first (apt install certbot python3-certbot-nginx)."; exit 1; }

# Resolve the configured domain — abort early if DNS isn't there yet,
# otherwise certbot will fail and leave nginx wedged.
log "Verifying DNS for $DOMAIN"
if ! getent hosts "$DOMAIN" >/dev/null; then
    warn "Could not resolve $DOMAIN. Set the DNS A/AAAA records first."
    exit 1
fi
RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -n1)
echo "    $DOMAIN → $RESOLVED"

# ---------------------------------------------------------------------------
log "Pulling latest sources"
# ---------------------------------------------------------------------------
cd "$ALFRED_DIR"
sudo -u "$(stat -c '%U' .)" git pull --ff-only || warn "git pull failed — continuing with the working tree"

# ---------------------------------------------------------------------------
log "Updating backend/.env for $DOMAIN"
# ---------------------------------------------------------------------------
ENV_FILE="${ALFRED_DIR}/backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE — copy backend/.env.example to it and fill the Google OAuth credentials." >&2
    exit 1
fi

# In-place edits, idempotent. Adds keys when absent.
upsert_env() {
    local key="$1" val="$2"
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
        printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    fi
}
upsert_env APP_URL "https://${DOMAIN}"
upsert_env FRONTEND_URL "https://${DOMAIN}"
# Tighten CORS to the public host plus localhost for dev access from the same box.
upsert_env CORS_ORIGINS "https://${DOMAIN},http://localhost:30001"
# Accept browser-side requests from any tail*.ts.net host too so the
# Tailscale-served URL keeps working in parallel.
upsert_env CORS_ORIGIN_REGEX '^https://.*\.tail.*\.ts\.net$'

echo "    APP_URL=https://${DOMAIN}"
echo "    FRONTEND_URL=https://${DOMAIN}"

# ---------------------------------------------------------------------------
log "Installing nginx vhost"
# ---------------------------------------------------------------------------
install -m 0644 "${ALFRED_DIR}/deploy/nginx/${DOMAIN}.conf" "$NGINX_SITE"
ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
mkdir -p /var/www/letsencrypt

# Validate the config before any reload.
nginx -t

# ---------------------------------------------------------------------------
log "Obtaining / renewing Let's Encrypt certificate"
# ---------------------------------------------------------------------------
if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    # First-time bootstrap: temporarily disable the 443 server block so
    # nginx can serve the HTTP-01 challenge before the cert exists.
    TMP="${NGINX_SITE}.bootstrap"
    cat > "$TMP" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 404; }
}
EOF
    ln -sfn "$TMP" "$NGINX_ENABLED"
    systemctl reload nginx
    certbot certonly --webroot -w /var/www/letsencrypt \
        --non-interactive --agree-tos -m "$LE_EMAIL" \
        -d "$DOMAIN"
    rm -f "$TMP"
    ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
else
    certbot renew --quiet || warn "certbot renew failed — current cert still valid?"
fi

# Re-validate now that the cert exists and reload.
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------------------
log "Bringing up the docker-compose stack"
# ---------------------------------------------------------------------------
cd "$ALFRED_DIR"
docker compose up -d --build

# ---------------------------------------------------------------------------
log "Smoke tests"
# ---------------------------------------------------------------------------
sleep 5
if curl -ksf -o /dev/null -w '%{http_code}\n' "https://${DOMAIN}/api/auth/google/login" | grep -qE '^(200|302|307|503)$'; then
    echo "    /api reachable ✅"
else
    warn "/api not reachable — check 'docker compose logs backend'"
fi
if curl -ksf -o /dev/null -w '%{http_code}\n' "https://${DOMAIN}/" | grep -qE '^(200|304)$'; then
    echo "    / reachable ✅"
else
    warn "/ not reachable — check 'docker compose logs frontend'"
fi

# ---------------------------------------------------------------------------
log "Next steps"
# ---------------------------------------------------------------------------
cat <<EOF
Add the new public origin to Google Cloud Console for OAuth:

  Authorized JavaScript origins:
    https://${DOMAIN}

  Authorized redirect URIs:
    https://${DOMAIN}/api/auth/google/callback

If you want the stack to come up on boot, install the systemd unit:

  sudo bash systemd/install.sh
EOF
