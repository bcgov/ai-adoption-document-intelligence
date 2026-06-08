#!/usr/bin/env sh
# Prisma runs the seed from this app directory. tsx resolves dependencies from the
# seed file path under apps/shared; widen NODE_PATH so workspace deps resolve.
set -e
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
APP_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$APP_DIR/../.." && pwd)"
export NODE_PATH="$APP_DIR/node_modules:$REPO_ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"
cd "$APP_DIR"
exec npx tsx ../shared/prisma/seed.ts
