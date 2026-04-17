#!/usr/bin/env bash
#
# oc-port-forward-prod.sh — Port-forward internal-only services from prod.
#
# Starts `oc port-forward` for Temporal UI and Grafana in the fd34fb-prod
# namespace so you can reach them from a browser on localhost. Both services
# are ClusterIP only (no external Route), so this is the sanctioned way in.
#
# Usage:
#   ./scripts/oc-port-forward-prod.sh
#   ./scripts/oc-port-forward-prod.sh --only temporal
#   ./scripts/oc-port-forward-prod.sh --only grafana
#   ./scripts/oc-port-forward-prod.sh --temporal-port 18080 --grafana-port 13001
#
# Press Ctrl+C to stop both tunnels.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NAMESPACE="fd34fb-prod"
INSTANCE="bcgov-di"

TEMPORAL_SERVICE="${INSTANCE}-temporal-ui"
TEMPORAL_REMOTE_PORT=8080
TEMPORAL_LOCAL_PORT=8080

GRAFANA_SERVICE="${INSTANCE}-plg-grafana"
GRAFANA_REMOTE_PORT=3001
GRAFANA_LOCAL_PORT=3001

# ---------- helpers ----------

log_info()  { echo "[INFO] $*"; }
log_error() { echo "[ERROR] $*" >&2; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Port-forward internal-only services in ${NAMESPACE} (instance ${INSTANCE}).

Options:
  --only <temporal|grafana>  Forward only one service (default: both)
  --temporal-port <port>     Local port for Temporal UI (default: ${TEMPORAL_LOCAL_PORT})
  --grafana-port <port>      Local port for Grafana (default: ${GRAFANA_LOCAL_PORT})
  --help, -h                 Show this help

Services forwarded:
  Temporal UI   svc/${TEMPORAL_SERVICE}:${TEMPORAL_REMOTE_PORT}  -> http://localhost:<temporal-port>/
  Grafana       svc/${GRAFANA_SERVICE}:${GRAFANA_REMOTE_PORT}   -> http://localhost:<grafana-port>/
EOF
}

# ---------- argument parsing ----------

ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)
      [[ -z "${2:-}" ]] && { log_error "--only requires a value"; exit 1; }
      case "$2" in
        temporal|grafana) ONLY="$2" ;;
        *) log_error "--only must be 'temporal' or 'grafana'"; exit 1 ;;
      esac
      shift 2
      ;;
    --temporal-port)
      TEMPORAL_LOCAL_PORT="$2"; shift 2 ;;
    --grafana-port)
      GRAFANA_LOCAL_PORT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) log_error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# ---------- pre-flight: log in as SA ----------

bash "${SCRIPT_DIR}/oc-login-sa.sh" --namespace "${NAMESPACE}" >/dev/null || {
  log_error "Failed to log in as service account for ${NAMESPACE}"
  log_error "Run: ./scripts/oc-setup-sa.sh --namespace ${NAMESPACE}"
  exit 1
}

# ---------- background port-forwards ----------

declare -a PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [[ -n "${pid:-}" ]] && kill "${pid}" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo ""
  log_info "Stopped."
}
trap cleanup EXIT INT TERM

start_pf() {
  local label="$1" svc="$2" local_port="$3" remote_port="$4"
  oc port-forward "svc/${svc}" -n "${NAMESPACE}" "${local_port}:${remote_port}" \
    >/dev/null 2>&1 &
  local pid=$!
  PIDS+=("${pid}")
  # Give oc a moment to bind; if port conflict or error, background will die fast.
  sleep 1
  if ! kill -0 "${pid}" 2>/dev/null; then
    log_error "${label}: port-forward died (port ${local_port} in use? service missing?)"
    return 1
  fi
  printf '[INFO] %-12s -> http://localhost:%s/\n' "${label}" "${local_port}"
}

echo ""
if [[ -z "${ONLY}" || "${ONLY}" == "temporal" ]]; then
  start_pf "Temporal UI" "${TEMPORAL_SERVICE}" "${TEMPORAL_LOCAL_PORT}" "${TEMPORAL_REMOTE_PORT}" || true
fi
if [[ -z "${ONLY}" || "${ONLY}" == "grafana" ]]; then
  start_pf "Grafana"     "${GRAFANA_SERVICE}"  "${GRAFANA_LOCAL_PORT}"  "${GRAFANA_REMOTE_PORT}"  || true
fi

if [[ ${#PIDS[@]} -eq 0 ]]; then
  log_error "No port-forwards started."
  exit 1
fi

echo ""
log_info "Press Ctrl+C to stop."
wait
