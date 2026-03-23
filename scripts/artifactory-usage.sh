#!/usr/bin/env bash
#
# artifactory-usage.sh — Show Artifactory storage usage for the project's container registry.
#
# Usage:
#   ./scripts/artifactory-usage.sh --env dev
#   ./scripts/artifactory-usage.sh --env prod
#
# Prerequisites:
#   - Artifactory credentials configured in deployments/openshift/config/<env>.env
#   - curl and python3 installed
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/config-loader.sh"

ARTIFACTORY_REPO="kfd3-fd34fb-local"

# ---------- helpers ----------

log_info()  { echo -e "\033[0;36m[INFO]\033[0m  $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

usage() {
  cat <<EOF
Usage: $(basename "$0") --env <dev|prod>

Show Artifactory storage usage for the project's container registry.

Options:
  --env, -e    Environment profile (required, for Artifactory credentials)
  --help, -h   Show this help message
EOF
}

# ---------- parse arguments ----------

ENV_PROFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e) ENV_PROFILE="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) log_error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "${ENV_PROFILE}" ]]; then
  log_error "--env is required (dev or prod)"
  usage
  exit 1
fi

# ---------- load credentials ----------

load_config --env "${ENV_PROFILE}" || { log_error "Failed to load config."; exit 1; }

ARTIFACTORY_URL=$(get_config "ARTIFACTORY_URL") || { log_error "ARTIFACTORY_URL not found in config."; exit 1; }
ARTIFACTORY_SA_USERNAME=$(get_config "ARTIFACTORY_SA_USERNAME") || { log_error "ARTIFACTORY_SA_USERNAME not found in config."; exit 1; }
ARTIFACTORY_SA_PASSWORD=$(get_config "ARTIFACTORY_SA_PASSWORD") || { log_error "ARTIFACTORY_SA_PASSWORD not found in config."; exit 1; }

AUTH="${ARTIFACTORY_SA_USERNAME}:${ARTIFACTORY_SA_PASSWORD}"
BASE_URL="https://${ARTIFACTORY_URL}/artifactory"

# ---------- query ----------

log_info "Querying Artifactory storage for repo '${ARTIFACTORY_REPO}'..."
echo ""

AQL_RESULT=$(curl -sf -u "${AUTH}" -X POST "${BASE_URL}/api/search/aql" \
  -H "Content-Type: text/plain" \
  -d "items.find({\"repo\":\"${ARTIFACTORY_REPO}\",\"type\":\"file\"}).include(\"repo\",\"path\",\"name\",\"size\")" 2>&1) || {
  log_error "AQL query failed. Check credentials."
  exit 1
}

# Also get the tag list per image
IMAGES=$(curl -sf -u "${AUTH}" "${BASE_URL}/api/docker/${ARTIFACTORY_REPO}/v2/_catalog" | python3 -c "import sys,json; print('\n'.join(json.load(sys.stdin).get('repositories',[])))" 2>/dev/null)

echo "${AQL_RESULT}" | python3 -c "
import sys, json

data = json.load(sys.stdin)
results = data['results']
total_files = data['range']['total']

# Group by image and tag
images = {}
tags = {}
for r in results:
    parts = r['path'].split('/')
    image = parts[0]
    tag = '/'.join(parts[1:]) if len(parts) > 1 else 'root'
    images[image] = images.get(image, 0) + r['size']
    key = f'{image}:{tag}'
    tags[key] = tags.get(key, 0) + r['size']

grand_total = sum(images.values())

def fmt(b):
    if b >= 1073741824:
        return f'{b/1073741824:.2f} GB'
    elif b >= 1048576:
        return f'{b/1048576:.1f} MB'
    elif b >= 1024:
        return f'{b/1024:.1f} KB'
    return f'{b} B'

print('=' * 60)
print(f'  Artifactory Storage Report')
print(f'  Repo: ${ARTIFACTORY_REPO}')
print('=' * 60)
print(f'  Total storage: {fmt(grand_total)}')
print(f'  Total files:   {total_files}')
print()

print('  Per image:')
for img in sorted(images):
    print(f'    {img:25s} {fmt(images[img]):>10s}')
print()

# Separate named tags from SHA tags
named = {}
sha_tags = {}
for key, size in sorted(tags.items()):
    image, tag = key.split(':', 1)
    if tag.startswith('sha256:') or tag.startswith('sha256__'):
        sha_tags.setdefault(image, []).append((tag, size))
    else:
        named.setdefault(image, []).append((tag, size))

print('  Named tags:')
for img in sorted(named):
    for tag, size in named[img]:
        label = f'{img}:{tag}'
        print(f'    {label:55s} {fmt(size):>10s}')
print()

sha_count = sum(len(v) for v in sha_tags.values())
sha_total = sum(s for v in sha_tags.values() for _, s in v)
sha_nonzero = sum(1 for v in sha_tags.values() for _, s in v if s > 0)

print(f'  SHA-tagged manifests: {sha_count} total, {sha_nonzero} with unique layers')
print(f'  SHA-tagged storage:   {fmt(sha_total)}')
for img in sorted(sha_tags):
    img_sha_total = sum(s for _, s in sha_tags[img])
    img_sha_count = len(sha_tags[img])
    img_sha_nonzero = sum(1 for _, s in sha_tags[img] if s > 0)
    print(f'    {img:25s} {img_sha_count:3d} tags, {img_sha_nonzero:3d} with unique layers, {fmt(img_sha_total):>10s}')
print()
print('=' * 60)
"
