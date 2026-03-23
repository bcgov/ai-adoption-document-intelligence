#!/usr/bin/env bash
#
# artifactory-cleanup.sh — Remove unused SHA-tagged image manifests from Artifactory.
#
# Identifies SHA-tagged manifests (stored as sha256__* folders) that are not
# referenced by any named tag and deletes them to reclaim storage.
#
# Usage:
#   ./scripts/artifactory-cleanup.sh --env dev              # Dry run (default)
#   ./scripts/artifactory-cleanup.sh --env dev --delete      # Actually delete
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
log_warn()  { echo -e "\033[0;33m[WARN]\033[0m  $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }
log_ok()    { echo -e "\033[0;32m[OK]\033[0m    $*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") --env <dev|prod> [--delete]

Remove unused SHA-tagged image manifests from Artifactory.

By default runs in dry-run mode (shows what would be deleted without deleting).

Options:
  --env, -e    Environment profile (required, for Artifactory credentials)
  --delete     Actually delete the manifests (default: dry run)
  --help, -h   Show this help message
EOF
}

# ---------- parse arguments ----------

ENV_PROFILE=""
DO_DELETE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e) ENV_PROFILE="$2"; shift 2 ;;
    --delete) DO_DELETE=true; shift ;;
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
DOCKER_API="${BASE_URL}/api/docker/${ARTIFACTORY_REPO}/v2"

# ---------- discover images ----------

log_info "Discovering images in '${ARTIFACTORY_REPO}'..."

IMAGES=$(curl -sf -u "${AUTH}" "${DOCKER_API}/_catalog" \
  | python3 -c "import sys,json; print('\n'.join(json.load(sys.stdin).get('repositories',[])))" 2>/dev/null) || {
  log_error "Failed to list repositories. Check credentials."
  exit 1
}

if [[ -z "${IMAGES}" ]]; then
  log_info "No images found."
  exit 0
fi

# ---------- use AQL to find all folder paths, then classify ----------

log_info "Querying all stored manifests via AQL..."

AQL_RESULT=$(curl -sf -u "${AUTH}" -X POST "${BASE_URL}/api/search/aql" \
  -H "Content-Type: text/plain" \
  -d "items.find({\"repo\":\"${ARTIFACTORY_REPO}\",\"type\":\"file\"}).include(\"repo\",\"path\",\"name\",\"size\")" 2>&1) || {
  log_error "AQL query failed."
  exit 1
}

# Use python to do all the analysis: find SHA folders, resolve named tag digests, compute unreferenced
CLEANUP_PLAN=$(echo "${AQL_RESULT}" | python3 -c "
import sys, json

data = json.load(sys.stdin)
results = data['results']

# Group files by image/tag (first two path components)
tag_sizes = {}  # (image, tag) -> total size
for r in results:
    parts = r['path'].split('/')
    if len(parts) < 2:
        continue
    image = parts[0]
    tag = parts[1]
    key = (image, tag)
    tag_sizes[key] = tag_sizes.get(key, 0) + r['size']

# Classify tags
named_tags = {}   # image -> [tag, ...]
sha_tags = {}     # image -> [(tag, size), ...]

for (image, tag), size in tag_sizes.items():
    if tag.startswith('sha256__') or tag.startswith('sha256:'):
        sha_tags.setdefault(image, []).append((tag, size))
    else:
        named_tags.setdefault(image, []).append(tag)

# Output as JSON for the shell to process
output = {
    'named_tags': {img: tags for img, tags in named_tags.items()},
    'sha_tags': {img: [(t, s) for t, s in entries] for img, entries in sha_tags.items()},
}
print(json.dumps(output))
" 2>/dev/null) || {
  log_error "Failed to analyze AQL results."
  exit 1
}

TOTAL_DELETE_COUNT=0
TOTAL_DELETE_SIZE=0

for image in ${IMAGES}; do
  log_info "Analyzing ${image}..."

  # Get named tags and SHA tags for this image from the plan
  IMAGE_NAMED_TAGS=$(echo "${CLEANUP_PLAN}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data.get('named_tags', {}).get('${image}', []):
    print(t)
" 2>/dev/null)

  IMAGE_SHA_ENTRIES=$(echo "${CLEANUP_PLAN}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for tag, size in data.get('sha_tags', {}).get('${image}', []):
    print(f'{tag}\t{size}')
" 2>/dev/null)

  if [[ -z "${IMAGE_SHA_ENTRIES}" ]]; then
    log_info "  No SHA manifests found, nothing to clean."
    continue
  fi

  NAMED_COUNT=$(echo "${IMAGE_NAMED_TAGS}" | grep -c . 2>/dev/null || echo "0")
  SHA_COUNT=$(echo "${IMAGE_SHA_ENTRIES}" | grep -c . 2>/dev/null || echo "0")
  log_info "  Named tags: ${NAMED_COUNT}, SHA manifests: ${SHA_COUNT}"

  # For each named tag, resolve its content digest to find which SHA it references
  REFERENCED_DIGESTS=()
  while IFS= read -r tag; do
    [[ -z "${tag}" ]] && continue
    # Get the manifest digest via HEAD request
    digest=$(curl -sf -u "${AUTH}" -I \
      -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
      -H "Accept: application/vnd.oci.image.manifest.v1+json" \
      -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
      -H "Accept: application/vnd.oci.image.index.v1+json" \
      "${DOCKER_API}/${image}/manifests/${tag}" 2>/dev/null \
      | grep -i "docker-content-digest" \
      | sed 's/.*: *//;s/\r//' || true)

    if [[ -n "${digest}" ]]; then
      REFERENCED_DIGESTS+=("${digest}")
      # Check if manifest list with child manifests
      manifest_body=$(curl -sf -u "${AUTH}" \
        -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
        -H "Accept: application/vnd.oci.image.index.v1+json" \
        "${DOCKER_API}/${image}/manifests/${tag}" 2>/dev/null || true)
      while IFS= read -r child; do
        [[ -n "${child}" ]] && REFERENCED_DIGESTS+=("${child}")
      done < <(echo "${manifest_body}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for m in data.get('manifests', []):
        d = m.get('digest', '')
        if d: print(d)
except: pass
" 2>/dev/null || true)
    fi
  done <<< "${IMAGE_NAMED_TAGS}"

  log_info "  Resolved ${#REFERENCED_DIGESTS[@]} referenced digest(s) from named tags"

  # Check each SHA entry against referenced digests
  while IFS=$'\t' read -r sha_tag size; do
    [[ -z "${sha_tag}" ]] && continue

    # Convert folder format to digest: sha256__abc -> sha256:abc
    digest_form="${sha_tag/sha256__/sha256:}"

    is_referenced=false
    for ref in "${REFERENCED_DIGESTS[@]}"; do
      if [[ "${ref}" == "${digest_form}" ]]; then
        is_referenced=true
        break
      fi
    done

    if [[ "${is_referenced}" == "true" ]]; then
      continue
    fi

    size_mb=$(python3 -c "print(f'{${size}/1048576:.1f}')" 2>/dev/null || echo "?")
    TOTAL_DELETE_SIZE=$((TOTAL_DELETE_SIZE + size))
    TOTAL_DELETE_COUNT=$((TOTAL_DELETE_COUNT + 1))

    # Storage API uses sha256: (with colon), AQL returns sha256__ (with underscores)
    storage_tag="${sha_tag/sha256__/sha256:}"

    if [[ "${DO_DELETE}" == "true" ]]; then
      log_info "  Deleting ${image}/${storage_tag} (${size_mb} MB)..."
      http_code=$(curl -s -o /dev/null -w "%{http_code}" -u "${AUTH}" -X DELETE \
        "${BASE_URL}/${ARTIFACTORY_REPO}/${image}/${storage_tag}" 2>/dev/null || echo "000")

      if [[ "${http_code}" == "204" || "${http_code}" == "200" ]]; then
        log_ok "  Deleted ${image}/${storage_tag}"
      else
        log_warn "  Failed to delete ${image}/${storage_tag} (HTTP ${http_code})"
      fi
    else
      echo "    [DRY RUN] Would delete ${image}/${storage_tag} (${size_mb} MB)"
    fi
  done <<< "${IMAGE_SHA_ENTRIES}"
done

echo ""

TOTAL_SIZE_MB=$(python3 -c "print(f'{${TOTAL_DELETE_SIZE}/1048576:.1f}')" 2>/dev/null || echo "?")
TOTAL_SIZE_GB=$(python3 -c "print(f'{${TOTAL_DELETE_SIZE}/1073741824:.2f}')" 2>/dev/null || echo "?")

if [[ "${DO_DELETE}" == "true" ]]; then
  log_ok "Cleanup complete. Deleted ${TOTAL_DELETE_COUNT} unreferenced manifests (${TOTAL_SIZE_GB} GB)."
  echo ""
  log_info "Note: Artifactory may take time to reclaim disk space from deleted layers."
  log_info "Run './scripts/artifactory-usage.sh --env ${ENV_PROFILE}' to verify."
else
  echo "============================================================"
  echo "  DRY RUN SUMMARY"
  echo "============================================================"
  echo "  Would delete: ${TOTAL_DELETE_COUNT} unreferenced SHA manifests"
  echo "  Estimated space: ${TOTAL_SIZE_GB} GB (${TOTAL_SIZE_MB} MB)"
  echo ""
  echo "  To actually delete, run:"
  echo "    ./scripts/artifactory-cleanup.sh --env ${ENV_PROFILE} --delete"
  echo "============================================================"
fi
