#!/usr/bin/env bash
# Install the Alfred systemd unit. Run as root from anywhere; the
# script rewrites the unit's WorkingDirectory to the repo's absolute
# path so the install is portable.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root (try: sudo $0)" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALFRED_DIR="$(dirname "$SCRIPT_DIR")"
UNIT_NAME="alfred.service"
SOURCE="${SCRIPT_DIR}/${UNIT_NAME}"
TARGET="/etc/systemd/system/${UNIT_NAME}"

if [[ ! -f "$SOURCE" ]]; then
    echo "Unit template not found at $SOURCE" >&2
    exit 1
fi

sed "s|__ALFRED_DIR__|${ALFRED_DIR}|g" "$SOURCE" > "$TARGET"
chmod 644 "$TARGET"

systemctl daemon-reload
systemctl enable --now "$UNIT_NAME"

cat <<EOF
Installed: $TARGET
ALFRED_DIR=$ALFRED_DIR

Manage the service with:
  systemctl status $UNIT_NAME
  systemctl restart $UNIT_NAME
  systemctl stop $UNIT_NAME
  journalctl -u $UNIT_NAME -f
EOF
