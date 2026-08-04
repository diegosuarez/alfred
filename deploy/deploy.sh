#!/usr/bin/env bash
# Bring up Alfred on this host.
#
# Assumes:
#   - Repo cloned at /opt/alfred (override with ALFRED_DIR=).
#   - Docker + docker compose plugin installed.
#   - nginx + certbot installed (apt: nginx, certbot, python3-certbot-nginx).
#   - DNS for $ALFRED_DOMAIN already pointing at this host.
#
# Idempotent: safe to re-run after editing .env or after a `git pull`.
#
# Required env vars (no defaults — fail fast):
#   ALFRED_DOMAIN   Public hostname, e.g. alfred.example.com
#   LE_EMAIL        Email registered with Let's Encrypt for renewal notices
#
# Optional env vars:
#   ALFRED_DIR             Path to the clone (default: /opt/alfred)
#   ALFRED_SSL_CERT_DIR    /etc/letsencrypt/live/<dir> to use. Defaults to
#                          $ALFRED_DOMAIN; override to point at a wildcard
#                          cert instead, e.g. wildcard.example.com.
#
# Usage:
#   sudo ALFRED_DOMAIN=alfred.example.com LE_EMAIL=you@example.com bash deploy/deploy.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root (sudo $0)" >&2
    exit 1
fi

: "${ALFRED_DOMAIN:?Set ALFRED_DOMAIN (e.g. ALFRED_DOMAIN=alfred.example.com)}"
: "${LE_EMAIL:?Set LE_EMAIL (used by certbot for renewal notices)}"

ALFRED_DIR="${ALFRED_DIR:-/opt/alfred}"
DOMAIN="$ALFRED_DOMAIN"
SSL_CERT_DIR="${ALFRED_SSL_CERT_DIR:-$DOMAIN}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"
NGINX_TEMPLATE="${ALFRED_DIR}/deploy/nginx/alfred.conf"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------------------
log "Sanity checks"
# ---------------------------------------------------------------------------
[[ -d "$ALFRED_DIR" ]] || { echo "Missing $ALFRED_DIR — clone the repo there first." >&2; exit 1; }
[[ -f "$NGINX_TEMPLATE" ]] || { echo "Missing $NGINX_TEMPLATE." >&2; exit 1; }
command -v docker >/dev/null || { echo "Install docker first."; exit 1; }
command -v nginx >/dev/null || [[ -x /usr/sbin/nginx ]] || { echo "Install nginx first (apt install nginx)."; exit 1; }
command -v certbot >/dev/null || { echo "Install certbot first (apt install certbot python3-certbot-nginx)."; exit 1; }
NGINX_BIN="$(command -v nginx || printf /usr/sbin/nginx)"

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
    # sed eats backslashes and expands & in the replacement text, which would
    # silently mangle regex values like CORS_ORIGIN_REGEX. Escape both first.
    local esc="${val//\\/\\\\}"
    esc="${esc//&/\\&}"
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
    else
        printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    fi
}
upsert_env APP_URL "https://${DOMAIN}"
upsert_env FRONTEND_URL "https://${DOMAIN}"
# Tighten CORS to the public host plus localhost for dev access from the same box.
upsert_env CORS_ORIGINS "https://${DOMAIN},http://localhost:30005"
# Accept browser-side requests from any tail*.ts.net host too so the
# Tailscale-served URL keeps working in parallel.
upsert_env CORS_ORIGIN_REGEX '^https://.*\.tail.*\.ts\.net$'

echo "    APP_URL=https://${DOMAIN}"
echo "    FRONTEND_URL=https://${DOMAIN}"

# ---------------------------------------------------------------------------
log "Installing nginx vhost"
# ---------------------------------------------------------------------------
# Render the template with the target domain + cert directory. `__DOMAIN__` /
# `__SSL_CERT_DIR__` are the only placeholders; everything else is reusable.
RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT
sed -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__SSL_CERT_DIR__|${SSL_CERT_DIR}|g" \
    "$NGINX_TEMPLATE" > "$RENDERED"

# Another vhost may already answer for this domain — typically one edited by
# hand to add extra hostnames or a wildcard certificate. Overwriting it, or
# installing a second vhost with the same server_name, breaks the site, so
# bail out and let the operator merge the change.
CONFLICT="$(grep -rlE "^[[:space:]]*server_name[^;]*[[:space:]]${DOMAIN}([[:space:];]|$)" \
    /etc/nginx/sites-enabled/ 2>/dev/null | grep -Fxv "$NGINX_ENABLED" || true)"
if [[ -n "$CONFLICT" ]]; then
    warn "Another enabled vhost already serves ${DOMAIN}:"
    printf '     %s\n' $CONFLICT >&2
    warn "Leaving nginx untouched. Merge deploy/nginx/alfred.conf into it by hand."
elif [[ -f "$NGINX_SITE" ]] && ! cmp -s "$RENDERED" "$NGINX_SITE"; then
    # Locally modified. Keep it unless the operator explicitly asks otherwise.
    if [[ "${ALFRED_FORCE_NGINX:-0}" == "1" ]]; then
        warn "Overwriting locally modified $NGINX_SITE (ALFRED_FORCE_NGINX=1)."
        install -m 0644 "$RENDERED" "$NGINX_SITE"
    else
        warn "$NGINX_SITE differs from the template — keeping it."
        warn "Diff it against deploy/nginx/alfred.conf, or re-run with ALFRED_FORCE_NGINX=1 to replace it."
    fi
else
    install -m 0644 "$RENDERED" "$NGINX_SITE"
fi
# Only enable a vhost that actually exists — a dangling symlink in
# sites-enabled makes `nginx -t` fail and takes every other site down.
if [[ -f "$NGINX_SITE" ]]; then
    ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
fi
mkdir -p /var/www/letsencrypt

# ---------------------------------------------------------------------------
log "Checking TLS certificate"
# ---------------------------------------------------------------------------
if [[ -f "/etc/letsencrypt/live/${SSL_CERT_DIR}/fullchain.pem" ]]; then
    echo "    using existing ${SSL_CERT_DIR} certificate"
else
    warn "No certificate at /etc/letsencrypt/live/${SSL_CERT_DIR}. Requesting one for ${DOMAIN}."
    certbot certonly --webroot -w /var/www/letsencrypt \
        --non-interactive --agree-tos -m "$LE_EMAIL" \
        -d "$DOMAIN"
fi

"$NGINX_BIN" -t
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
