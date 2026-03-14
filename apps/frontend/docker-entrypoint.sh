#!/bin/sh
# Substitute BACKEND_SERVICE_URL into the nginx config template at container startup.
# This allows the backend proxy target to be set per-instance via environment variable.
set -e

BACKEND_SERVICE_URL="${BACKEND_SERVICE_URL:-http://localhost:3002}"

# Replace the placeholder in the nginx config
sed -i "s|__BACKEND_SERVICE_URL__|${BACKEND_SERVICE_URL}|g" /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
