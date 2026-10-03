#!/usr/bin/env bash
#
# oc-retry.sh -- Retry oc and helm calls that fail on a transient connection
# error to the OpenShift API.
#
# GitHub-hosted runners reach the cluster API over the public internet, where
# a share of new connections is refused or stalls for periods of minutes to
# hours; a retry a few seconds later almost always gets through. Sourcing this
# file defines shell functions named `oc` and `helm` that wrap the real
# binaries:
#
#   - A call whose error output matches a connection failure is retried.
#   - Any other failure (NotFound, Forbidden, validation, a rollout or Helm
#     --wait timeout) returns at once with its own exit code, so existence
#     checks such as `if oc get deployment x` still mean "not found".
#   - A manifest read from stdin (`-f -`) is buffered to a file first, so a
#     retry re-sends the whole manifest.
#   - One-shot oc subcommands get --request-timeout, so a stalled request fails
#     and is retried instead of hanging the job. Watches such as
#     `oc rollout status` are left without one.
#
# Every attempt's stderr is passed through, so the job log shows each failure.
#
# Usage:
#   source scripts/lib/oc-retry.sh
#
# Environment:
#   CLUSTER_RETRY_ATTEMPTS      attempts per call (default 6)
#   CLUSTER_RETRY_WAIT_SECONDS  wait between attempts (default 10)
#   OC_REQUEST_TIMEOUT          --request-timeout for one-shot oc calls (default 60s)
#

CLUSTER_RETRY_ATTEMPTS="${CLUSTER_RETRY_ATTEMPTS:-6}"
CLUSTER_RETRY_WAIT_SECONDS="${CLUSTER_RETRY_WAIT_SECONDS:-10}"
OC_REQUEST_TIMEOUT="${OC_REQUEST_TIMEOUT:-60s}"

# Error output meaning the request never got an answer from the API server.
OC_TRANSIENT_ERROR_PATTERN='dial tcp|i/o timeout|connection refused|connection reset by peer|TLS handshake timeout|Unable to connect to the server|net/http: request canceled|Client\.Timeout exceeded|context deadline exceeded|http2: client connection lost|unexpected EOF'
# Helm reports its own --wait timeout as "context deadline exceeded", so that
# phrase is not treated as a connection failure for helm.
HELM_TRANSIENT_ERROR_PATTERN='dial tcp|i/o timeout|connection refused|connection reset by peer|TLS handshake timeout|Kubernetes cluster unreachable|http2: client connection lost|unexpected EOF'

# oc subcommands that make one-shot requests and get --request-timeout.
OC_ONE_SHOT_SUBCOMMANDS=" annotate apply create delete describe get label patch whoami "

# Runs a cluster command, retrying it while it fails on a connection error.
#
# Arguments:
#   $1  binary (oc or helm)
#   $@  arguments for the binary
# Returns the exit code of the last attempt.
_cluster_retry() {
  local bin="$1"
  shift
  local -a args=("$@")
  local pattern stdin_file="" err_file rc attempt=1 i

  if [[ "${bin}" == "helm" ]]; then
    pattern="${HELM_TRANSIENT_ERROR_PATTERN}"
  else
    pattern="${OC_TRANSIENT_ERROR_PATTERN}"
  fi

  for i in "${!args[@]}"; do
    if [[ "${args[i]}" == "-" ]] && (( i > 0 )) \
      && [[ "${args[i - 1]}" == "-f" || "${args[i - 1]}" == "--filename" ]]; then
      stdin_file="$(mktemp)"
      cat > "${stdin_file}"
      args[i]="${stdin_file}"
    fi
  done

  if [[ "${bin}" == "oc" && "${OC_ONE_SHOT_SUBCOMMANDS}" == *" ${args[0]:-} "* \
    && " ${args[*]} " != *" --request-timeout"* ]]; then
    args+=("--request-timeout=${OC_REQUEST_TIMEOUT}")
  fi

  err_file="$(mktemp)"
  while true; do
    if command "${bin}" "${args[@]}" 2> "${err_file}"; then
      rc=0
    else
      rc=$?
    fi
    cat "${err_file}" >&2
    if (( rc == 0 || attempt >= CLUSTER_RETRY_ATTEMPTS )) \
      || ! grep -qE "${pattern}" "${err_file}"; then
      break
    fi
    echo "[WARN] ${bin} ${args[0]:-} failed on a connection error (attempt ${attempt}/${CLUSTER_RETRY_ATTEMPTS}); retrying in ${CLUSTER_RETRY_WAIT_SECONDS}s..." >&2
    sleep "${CLUSTER_RETRY_WAIT_SECONDS}"
    attempt=$((attempt + 1))
  done

  rm -f "${err_file}"
  if [[ -n "${stdin_file}" ]]; then
    rm -f "${stdin_file}"
  fi
  return "${rc}"
}

oc() {
  _cluster_retry oc "$@"
}

helm() {
  _cluster_retry helm "$@"
}
