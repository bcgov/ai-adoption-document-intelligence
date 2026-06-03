#!/bin/sh
# Substitute BACKEND_SERVICE_URL and RESOLVER into the nginx config at container startup.
# BACKEND_SERVICE_URL sets the proxy target; RESOLVER is read from /etc/resolv.conf so
# nginx re-resolves the upstream hostname per-request (avoids stale IP after restarts).
set -e

BACKEND_SERVICE_URL="${BACKEND_SERVICE_URL:-http://localhost:3002}"

# Extract the first nameserver from resolv.conf (works for both Docker and Podman).
# Fall back to Docker's embedded DNS (127.0.0.11) if resolv.conf is absent or empty.
RESOLVER=$(grep -m1 '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}')
RESOLVER="${RESOLVER:-127.0.0.11}"

# Replace placeholders in the nginx config
sed -i \
  -e "s|__BACKEND_SERVICE_URL__|${BACKEND_SERVICE_URL}|g" \
  -e "s|__RESOLVER__|${RESOLVER}|g" \
  /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
