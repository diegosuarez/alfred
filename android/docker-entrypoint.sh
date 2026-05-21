#!/usr/bin/env bash
set -euo pipefail

# Generate the debug keystore on first run so non-root container builds
# don't need a HOME directory. The keystore lives next to the app
# module and is gitignored.
KEYSTORE="/work/app/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
    echo "Generating debug keystore at $KEYSTORE"
    keytool -genkey -v -keystore "$KEYSTORE" \
        -storepass android -keypass android \
        -alias androiddebugkey \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

# HOME defaults to / for non-root users with no entry in /etc/passwd;
# Gradle wants a writable home for its caches. Point at /tmp.
export HOME="${HOME:-/tmp}"

exec gradle --no-daemon "$@"
