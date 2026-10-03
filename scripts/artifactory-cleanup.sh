#!/usr/bin/env bash
#
# artifactory-cleanup.sh — Reclaim storage in the Artifactory container repo.
#
# Three phases (rotation is optional, orphan + uploads always run):
#   1. Tag rotation — for each image, keep only the N most-recent named tags
#      matching a glob pattern; delete the rest. Use for immutable SHA tags like
#      `bcgov-di-<sha>` so they don't accumulate unbounded.
#   2. Orphan manifest reclamation — identifies SHA-tagged manifests (stored as
#      sha256__* folders) that are not referenced by any named tag and deletes
#      them.
#   3. Uploads cleanup — under <image>/_uploads/, delete blob files that are
#      at least an hour old and either (a) duplicates of layers already stored
#      in tag folders, or (b) older than 24 hours (stale upload sessions that
#      didn't get GC'd).
#
# Usage:
#   ./scripts/artifactory-cleanup.sh --env dev                        # Orphan cleanup, dry run
#   ./scripts/artifactory-cleanup.sh --env dev --delete                # Orphan cleanup, real
#   ./scripts/artifactory-cleanup.sh --keep 10 --match 'bcgov-di-*' --delete
#                                                                      # Rotation + orphan cleanup
#
# Failure handling: every Artifactory call is retried. If a named tag still
# cannot be resolved, that image's orphan cleanup is skipped (an incomplete
# reference set would make in-use manifests look unreferenced). Any failed
# lookup or delete makes the script exit 1 after finishing what it safely can;
# re-running is safe because a 404 on delete counts as already deleted.
#
# Prerequisites:
#   - Artifactory credentials configured in deployments/openshift/config/<env>.env
#     OR set via env vars ARTIFACTORY_URL / ARTIFACTORY_SA_USERNAME / ARTIFACTORY_SA_PASSWORD
#   - curl and python3 installed
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/config-loader.sh"
source "${SCRIPT_DIR}/lib/retry.sh"

ARTIFACTORY_REPO="kfd3-fd34fb-local"

# ---------- helpers ----------

log_info()  { echo -e "\033[0;36m[INFO]\033[0m  $*"; }
log_warn()  { echo -e "\033[0;33m[WARN]\033[0m  $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }
log_ok()    { echo -e "\033[0;32m[OK]\033[0m    $*"; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [--env <dev|prod>] [--keep N --match GLOB] [--delete]

Reclaim storage in the Artifactory container repo.

Phases:
  - Tag rotation (optional): pass --keep N AND --match GLOB to delete named
    tags matching GLOB beyond the N most recent per image (by created time).
  - Orphan cleanup (always): delete SHA-tagged manifests not referenced by any
    named tag.
  - Uploads cleanup (always): delete leftover blobs under <image>/_uploads/
    that are duplicates of stored layers or older than 24 hours, leaving any
    younger than an hour (a push may still own them).

By default runs in dry-run mode (shows what would be deleted without deleting).

Credentials are taken from these environment variables when set:
  ARTIFACTORY_URL, ARTIFACTORY_SA_USERNAME, ARTIFACTORY_SA_PASSWORD
Otherwise loaded from the --env config file (e.g., dev.env).

Options:
  --env, -e        Environment profile (optional if env vars are set)
  --keep, -k N     Keep the N most recent named tags matching --match per image
  --match, -m GLOB Glob pattern for named tags to rotate (e.g. 'bcgov-di-*')
  --delete         Actually delete (default: dry run)
  --help, -h       Show this help message
EOF
}

# ---------- parse arguments ----------

ENV_PROFILE=""
DO_DELETE=false
KEEP_N=""
MATCH_GLOB=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|-e) ENV_PROFILE="$2"; shift 2 ;;
    --keep|-k) KEEP_N="$2"; shift 2 ;;
    --match|-m) MATCH_GLOB="$2"; shift 2 ;;
    --delete) DO_DELETE=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) log_error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Rotation requires both or neither
if [[ -n "${KEEP_N}" && -z "${MATCH_GLOB}" ]] || [[ -z "${KEEP_N}" && -n "${MATCH_GLOB}" ]]; then
  log_error "--keep and --match must be used together."
  usage
  exit 1
fi
if [[ -n "${KEEP_N}" ]] && ! [[ "${KEEP_N}" =~ ^[0-9]+$ ]]; then
  log_error "--keep must be a non-negative integer."
  exit 1
fi

# ---------- load credentials ----------
# Prefer env vars (set by CI); fall back to config file for local usage.

if [[ -z "${ARTIFACTORY_URL:-}" || -z "${ARTIFACTORY_SA_USERNAME:-}" || -z "${ARTIFACTORY_SA_PASSWORD:-}" ]]; then
  if [[ -z "${ENV_PROFILE}" ]]; then
    log_error "Artifactory credentials not set in env and --env not provided."
    usage
    exit 1
  fi

  load_config --env "${ENV_PROFILE}" || { log_error "Failed to load config."; exit 1; }

  ARTIFACTORY_URL="${ARTIFACTORY_URL:-$(get_config "ARTIFACTORY_URL" 2>/dev/null || true)}"
  ARTIFACTORY_SA_USERNAME="${ARTIFACTORY_SA_USERNAME:-$(get_config "ARTIFACTORY_SA_USERNAME" 2>/dev/null || true)}"
  ARTIFACTORY_SA_PASSWORD="${ARTIFACTORY_SA_PASSWORD:-$(get_config "ARTIFACTORY_SA_PASSWORD" 2>/dev/null || true)}"
fi

if [[ -z "${ARTIFACTORY_URL}" || -z "${ARTIFACTORY_SA_USERNAME}" || -z "${ARTIFACTORY_SA_PASSWORD}" ]]; then
  log_error "Artifactory credentials could not be resolved from env or config."
  exit 1
fi

AUTH="${ARTIFACTORY_SA_USERNAME}:${ARTIFACTORY_SA_PASSWORD}"
BASE_URL="https://${ARTIFACTORY_URL}/artifactory"
DOCKER_API="${BASE_URL}/api/docker/${ARTIFACTORY_REPO}/v2"
CURL_OPTS=(--connect-timeout 30 --max-time 120)

# Artifactory intermittently drops a request after ~15s with no HTTP response
# (logged as HTTP 000), well inside --max-time, so a longer timeout does not
# help. af_request logs curl's exit code and error to show why. Every call
# is retried, and a lookup that still fails is treated as a failure, never as
# "this tag references nothing" — an empty answer would make the manifests a
# running image depends on look unreferenced, and they would be deleted.
API_ATTEMPTS=3
API_RETRY_WAIT=10

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

# Set to true by any failed lookup or delete; the script exits non-zero at the
# end so the CI job shows as failed and can be re-run (every step is safe to
# repeat: deletes treat 404 as already done).
HAD_FAILURE=false

# af_request <out-file> <curl args...> — one authenticated request, failing on
# HTTP errors. Credentials stay inside this function so a retry message, which
# echoes its command, never contains them.
af_request() {
  local out="$1"; shift
  local err="${out}.err"
  curl "${CURL_OPTS[@]}" -sS -f -u "${AUTH}" -o "${out}" "$@" 2>"${err}" && return 0
  local rc=$?
  log_warn "  Artifactory request failed (curl exit ${rc}): $(tr -d '\n' < "${err}")" >&2
  return "${rc}"
}

# af_fetch <out-file> <curl args...> — af_request with retries.
af_fetch() {
  with_retries "${API_ATTEMPTS}" "${API_RETRY_WAIT}" af_request "$@"
}

# af_delete_once <url> — one DELETE; 200/202/204 and 404 (already gone) succeed.
af_delete_once() {
  local code
  code=$(curl "${CURL_OPTS[@]}" -s -o /dev/null -w "%{http_code}" -u "${AUTH}" -X DELETE "$1" 2>/dev/null) || true
  case "${code}" in
    200|202|204|404) return 0 ;;
    *) log_warn "  DELETE returned HTTP ${code:-000}" >&2; return 1 ;;
  esac
}

# af_delete <url> <label> — DELETE with retries; records a failure if it never succeeds.
af_delete() {
  if with_retries "${API_ATTEMPTS}" "${API_RETRY_WAIT}" af_delete_once "$1"; then
    log_ok "  Deleted $2"
  else
    log_warn "  Failed to delete $2"
    HAD_FAILURE=true
  fi
}

MANIFEST_ACCEPT=(
  -H "Accept: application/vnd.docker.distribution.manifest.v2+json"
  -H "Accept: application/vnd.oci.image.manifest.v1+json"
  -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json"
  -H "Accept: application/vnd.oci.image.index.v1+json"
)

# ---------- discover images ----------

log_info "Discovering images in '${ARTIFACTORY_REPO}'..."

af_fetch "${WORK_DIR}/catalog.json" "${DOCKER_API}/_catalog" || {
  log_error "Failed to list repositories. Check credentials."
  exit 1
}
IMAGES=$(python3 -c "import sys,json; print('\n'.join(json.load(sys.stdin).get('repositories',[])))" \
  < "${WORK_DIR}/catalog.json")

if [[ -z "${IMAGES}" ]]; then
  log_info "No images found."
  exit 0
fi

# ---------- phase 1: tag rotation (optional) ----------
# When --keep N --match GLOB are provided, for each image delete named tags
# matching the glob beyond the N most-recently-created. The underlying layer
# manifests become orphans, which phase 2 then reclaims.

if [[ -n "${KEEP_N}" ]]; then
  log_info "Rotation: keeping ${KEEP_N} most-recent '${MATCH_GLOB}' tags per image..."

  # Match both `manifest.json` (legacy single-platform) and `list.manifest.json`
  # (OCI image index — what buildx writes for multi-platform pushes).
  af_fetch "${WORK_DIR}/rotation-aql.json" -X POST "${BASE_URL}/api/search/aql" \
    -H "Content-Type: text/plain" \
    -d "items.find({\"repo\":\"${ARTIFACTORY_REPO}\",\"type\":\"file\",\"\$or\":[{\"name\":\"manifest.json\"},{\"name\":\"list.manifest.json\"}]}).include(\"repo\",\"path\",\"name\",\"created\")" || {
    log_error "Rotation AQL query failed."
    exit 1
  }
  ROTATION_AQL=$(cat "${WORK_DIR}/rotation-aql.json")

  ROTATION_TAGS=$(echo "${ROTATION_AQL}" | python3 -c "
import sys, json, fnmatch
data = json.load(sys.stdin)
keep = int('${KEEP_N}')
glob = '${MATCH_GLOB}'

# Each result has path like 'backend-services/bcgov-di-abc123' (the tag dir)
# plus name like 'manifest.json' or 'list.manifest.json'. A tag may have both;
# dedupe by (image, tag), keeping the newest created timestamp.
by_image = {}
seen = {}
for r in data['results']:
    parts = r['path'].split('/')
    if len(parts) < 2:
        continue
    image, tag = parts[0], parts[1]
    if tag.startswith('sha256__') or tag.startswith('sha256:') or tag == '_uploads':
        continue
    if not fnmatch.fnmatch(tag, glob):
        continue
    created = r.get('created', '')
    key = (image, tag)
    if key in seen:
        if created > seen[key]:
            seen[key] = created
        continue
    seen[key] = created
    by_image.setdefault(image, []).append({'tag': tag, 'key': key})

for image, tags in by_image.items():
    for t in tags:
        t['created'] = seen[t['key']]
    tags.sort(key=lambda t: t['created'], reverse=True)
    for t in tags[keep:]:
        print(f\"{image}\t{t['tag']}\")
" 2>/dev/null) || true

  ROT_COUNT=0
  while IFS=$'\t' read -r image tag; do
    [[ -z "${image}" || -z "${tag}" ]] && continue
    ROT_COUNT=$((ROT_COUNT + 1))
    if [[ "${DO_DELETE}" == "true" ]]; then
      log_info "  Deleting named tag ${image}:${tag}..."
      af_delete "${BASE_URL}/${ARTIFACTORY_REPO}/${image}/${tag}" "${image}:${tag}"
    else
      echo "    [DRY RUN] Would delete named tag ${image}:${tag}"
    fi
  done <<< "${ROTATION_TAGS}"

  log_info "Rotation: ${ROT_COUNT} tag(s) flagged for deletion."
  echo ""
fi

# ---------- use AQL to find all folder paths, then classify ----------

log_info "Querying all stored manifests via AQL..."

af_fetch "${WORK_DIR}/aql.json" -X POST "${BASE_URL}/api/search/aql" \
  -H "Content-Type: text/plain" \
  -d "items.find({\"repo\":\"${ARTIFACTORY_REPO}\",\"type\":\"file\"}).include(\"repo\",\"path\",\"name\",\"size\",\"created\")" || {
  log_error "AQL query failed."
  exit 1
}
AQL_RESULT=$(cat "${WORK_DIR}/aql.json")

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
    elif tag != '_uploads':  # upload staging area (phase 3), not a tag
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
  # Resolve every named tag to the digests it keeps alive: the tag's own
  # manifest plus, for an image index, each child manifest. If any tag cannot
  # be resolved, skip deletions for this image — an incomplete reference set
  # would make in-use manifests look unreferenced.
  REFERENCED_DIGESTS=()
  LOOKUP_FAILED=false
  while IFS= read -r tag; do
    [[ -z "${tag}" ]] && continue
    if ! af_fetch "${WORK_DIR}/head" -I "${MANIFEST_ACCEPT[@]}" "${DOCKER_API}/${image}/manifests/${tag}"; then
      log_error "  Could not resolve ${image}:${tag}"
      LOOKUP_FAILED=true
      break
    fi
    digest=$(grep -i "^docker-content-digest:" "${WORK_DIR}/head" | sed 's/.*: *//;s/\r//' || true)
    if [[ -z "${digest}" ]]; then
      log_error "  No digest returned for ${image}:${tag}"
      LOOKUP_FAILED=true
      break
    fi
    REFERENCED_DIGESTS+=("${digest}")

    if ! af_fetch "${WORK_DIR}/manifest.json" "${MANIFEST_ACCEPT[@]}" "${DOCKER_API}/${image}/manifests/${tag}"; then
      log_error "  Could not read manifest for ${image}:${tag}"
      LOOKUP_FAILED=true
      break
    fi
    if ! children=$(python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('manifests', []):
    if m.get('digest'):
        print(m['digest'])
" < "${WORK_DIR}/manifest.json"); then
      log_error "  Unreadable manifest for ${image}:${tag}"
      LOOKUP_FAILED=true
      break
    fi
    while IFS= read -r child; do
      [[ -n "${child}" ]] && REFERENCED_DIGESTS+=("${child}")
    done <<< "${children}"
  done <<< "${IMAGE_NAMED_TAGS}"

  if [[ "${LOOKUP_FAILED}" == "true" ]]; then
    log_error "  Skipping orphan cleanup for ${image}: its named tags could not all be resolved."
    HAD_FAILURE=true
    continue
  fi

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
      af_delete "${BASE_URL}/${ARTIFACTORY_REPO}/${image}/${storage_tag}" "${image}/${storage_tag}"
    else
      echo "    [DRY RUN] Would delete ${image}/${storage_tag} (${size_mb} MB)"
    fi
  done <<< "${IMAGE_SHA_ENTRIES}"
done

echo ""

# ---------- phase 3: uploads cleanup ----------
# Under <image>/_uploads/, delete blob files that are at least an hour old and
# either:
#   (a) duplicates of layers already stored in tag folders, OR
#   (b) older than 24 hours (stale upload sessions never GC'd)
# These are leftover chunked-upload blobs that should not persist post-push.
# Younger blobs may belong to a push that is still running or has just
# finished; Artifactory can hold those, so a delete hangs until it times out,
# and deleting a live one would break that push. They are left for a later run.

log_info "Phase 3: cleaning _uploads (duplicate and stale blobs)..."

UPLOADS_PLAN=$(echo "${AQL_RESULT}" | python3 -c "
import sys, json
from datetime import datetime, timezone, timedelta

data = json.load(sys.stdin)
now = datetime.now(timezone.utc)
stale_cutoff = now - timedelta(hours=24)
young_cutoff = now - timedelta(hours=1)

# Build set of (image, sha-blob-name) referenced as layer files in non-_uploads folders
layer_blobs = set()
uploads = []  # (image, path, name, size, created)

for r in data['results']:
    parts = r['path'].split('/')
    if len(parts) < 2:
        continue
    image = parts[0]
    name = r['name']
    if parts[1] == '_uploads':
        if name.startswith('sha256__'):
            uploads.append((image, r['path'], name, r['size'], r.get('created', '')))
    else:
        if name.startswith('sha256__'):
            layer_blobs.add((image, name))

for image, path, name, size, created in uploads:
    try:
        t = datetime.fromisoformat(created.replace('Z', '+00:00'))
    except Exception:
        continue  # no usable timestamp: leave it
    is_duplicate = (image, name) in layer_blobs
    is_stale = t < stale_cutoff
    if not (is_duplicate or is_stale):
        continue
    if t > young_cutoff:
        print(f'{path}\t{name}\t{size}\tyoung')
        continue
    reason = 'dup' if is_duplicate else 'stale'
    print(f'{path}\t{name}\t{size}\t{reason}')
" 2>/dev/null) || true

UP_COUNT=0
UP_SIZE=0
UP_YOUNG=0
while IFS=$'\t' read -r upath uname usize ureason; do
  [[ -z "${upath}" || -z "${uname}" ]] && continue
  if [[ "${ureason}" == "young" ]]; then
    UP_YOUNG=$((UP_YOUNG + 1))
    continue
  fi
  UP_COUNT=$((UP_COUNT + 1))
  UP_SIZE=$((UP_SIZE + usize))
  size_mb=$(python3 -c "print(f'{${usize}/1048576:.1f}')" 2>/dev/null || echo "?")
  if [[ "${DO_DELETE}" == "true" ]]; then
    log_info "  Deleting ${upath}/${uname} (${size_mb} MB, ${ureason})..."
    af_delete "${BASE_URL}/${ARTIFACTORY_REPO}/${upath}/${uname}" "${upath}/${uname}"
  else
    echo "    [DRY RUN] Would delete ${upath}/${uname} (${size_mb} MB, ${ureason})"
  fi
done <<< "${UPLOADS_PLAN}"

UP_SIZE_MB=$(python3 -c "print(f'{${UP_SIZE}/1048576:.1f}')" 2>/dev/null || echo "?")
if [[ "${UP_YOUNG}" -gt 0 ]]; then
  log_info "Uploads cleanup: left ${UP_YOUNG} blob(s) younger than an hour for a later run."
fi
if [[ "${DO_DELETE}" == "true" ]]; then
  log_ok "Uploads cleanup: deleted ${UP_COUNT} blob(s) (${UP_SIZE_MB} MB)."
else
  log_info "Uploads cleanup: ${UP_COUNT} blob(s) flagged for deletion (${UP_SIZE_MB} MB)."
fi
echo ""

GRAND_DELETE_SIZE=$((TOTAL_DELETE_SIZE + UP_SIZE))
GRAND_DELETE_COUNT=$((TOTAL_DELETE_COUNT + UP_COUNT))
TOTAL_SIZE_MB=$(python3 -c "print(f'{${GRAND_DELETE_SIZE}/1048576:.1f}')" 2>/dev/null || echo "?")
TOTAL_SIZE_GB=$(python3 -c "print(f'{${GRAND_DELETE_SIZE}/1073741824:.2f}')" 2>/dev/null || echo "?")

if [[ "${DO_DELETE}" == "true" ]]; then
  log_ok "Cleanup complete. Deleted ${TOTAL_DELETE_COUNT} unreferenced manifests + ${UP_COUNT} upload blob(s) = ${GRAND_DELETE_COUNT} items (${TOTAL_SIZE_GB} GB)."
  echo ""
  log_info "Note: Artifactory may take time to reclaim disk space from deleted layers."
  log_info "Run './scripts/artifactory-usage.sh --env ${ENV_PROFILE}' to verify."
else
  echo "============================================================"
  echo "  DRY RUN SUMMARY"
  echo "============================================================"
  echo "  Would delete: ${TOTAL_DELETE_COUNT} unreferenced SHA manifests + ${UP_COUNT} upload blob(s)"
  echo "  Estimated space: ${TOTAL_SIZE_GB} GB (${TOTAL_SIZE_MB} MB)"
  echo ""
  echo "  To actually delete, run:"
  echo "    ./scripts/artifactory-cleanup.sh --env ${ENV_PROFILE} --delete"
  echo "============================================================"
fi

if [[ "${HAD_FAILURE}" == "true" ]]; then
  echo ""
  log_error "Some Artifactory lookups or deletes failed after ${API_ATTEMPTS} attempts (see warnings above)."
  log_error "Images whose tags could not be resolved were left untouched. Re-run to retry; it is safe to repeat."
  exit 1
fi
