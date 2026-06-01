#!/usr/bin/env bash
# Wrapper that loads backend .env (DATABASE_URL) and runs split-experiment.ts.
#
# Usage:
#   bash scripts/sdpr-experiment/split-experiment-share.sh \
#       '\\widget\SDPRDocuments\convert_sd0081\100-doc' \
#       [--hitl-count 50] \
#       [--manual-folder manual-review] \
#       [--seed 12345]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

[[ $# -lt 1 ]] && {
  echo "usage: $0 <share-root-unc> [--hitl-count N] [--manual-folder NAME] [--seed N]" >&2
  exit 2
}
SHARE_ROOT="$1"
shift

set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/apps/backend-services/.env"
set +a

npx tsx "${SCRIPT_DIR}/split-experiment.ts" \
  --share-root "$SHARE_ROOT" \
  "$@"
