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
#   - `helm upgrade` first clears a release left "pending" by an upgrade that
#     lost its connection mid-way (see helm_recover_pending_release); such a
#     release otherwise fails every later upgrade with "another operation
#     (install/upgrade/rollback) is in progress".
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
#   HELM_PENDING_MIN_AGE_SECONDS  age before a pending release left by another
#                               run is rolled back (default 600)
#

CLUSTER_RETRY_ATTEMPTS="${CLUSTER_RETRY_ATTEMPTS:-6}"
CLUSTER_RETRY_WAIT_SECONDS="${CLUSTER_RETRY_WAIT_SECONDS:-10}"
OC_REQUEST_TIMEOUT="${OC_REQUEST_TIMEOUT:-60s}"
HELM_PENDING_MIN_AGE_SECONDS="${HELM_PENDING_MIN_AGE_SECONDS:-600}"

# Error output meaning the request never got an answer from the API server.
OC_TRANSIENT_ERROR_PATTERN='dial tcp|i/o timeout|connection refused|connection reset by peer|TLS handshake timeout|Unable to connect to the server|net/http: request canceled|Client\.Timeout exceeded|context deadline exceeded|http2: client connection lost|unexpected EOF'
# Helm reports its own --wait timeout as "context deadline exceeded", so that
# phrase is not treated as a connection failure for helm.
HELM_TRANSIENT_ERROR_PATTERN='dial tcp|i/o timeout|connection refused|connection reset by peer|TLS handshake timeout|Kubernetes cluster unreachable|http2: client connection lost|unexpected EOF'

HELM_PENDING_ERROR_PATTERN='another operation \(install/upgrade/rollback\) is in progress'

# oc subcommands that make one-shot requests and get --request-timeout.
OC_ONE_SHOT_SUBCOMMANDS=" annotate apply create delete describe get label patch whoami "

# helm upgrade flags that take a separate value, skipped when finding the
# release name.
HELM_UPGRADE_VALUE_FLAGS=" -f --values --set --set-string --set-file --set-json --set-literal -n --namespace --timeout --version --description --post-renderer --post-renderer-args --kube-context --kubeconfig --history-max --repo --username --password --ca-file --cert-file --key-file -o --output --labels "

# Sets HELM_UPGRADE_RELEASE and HELM_UPGRADE_NAMESPACE from `helm upgrade`
# arguments (without the leading "upgrade"). Returns 1 if either is missing.
_helm_upgrade_target() {
  local arg expect_value="" release="" namespace="" previous=""
  for arg in "$@"; do
    if [[ -n "${expect_value}" ]]; then
      if [[ "${previous}" == "-n" || "${previous}" == "--namespace" ]]; then
        namespace="${arg}"
      fi
      expect_value=""
    elif [[ "${arg}" == --namespace=* ]]; then
      namespace="${arg#--namespace=}"
    elif [[ "${HELM_UPGRADE_VALUE_FLAGS}" == *" ${arg} "* ]]; then
      expect_value=1
    elif [[ "${arg}" != -* && -z "${release}" ]]; then
      release="${arg}"
    fi
    previous="${arg}"
  done
  HELM_UPGRADE_RELEASE="${release}"
  HELM_UPGRADE_NAMESPACE="${namespace}"
  [[ -n "${release}" && -n "${namespace}" ]]
}

# helm_recover_pending_release <release> <namespace> <min_age_seconds>
#
# An upgrade that loses its connection mid-way cannot record its outcome, so
# the release's latest revision stays pending-upgrade (or pending-rollback) and
# every later upgrade fails with "another operation ... is in progress". If the
# latest revision is pending and at least <min_age_seconds> old, roll back to
# the last deployed revision so a new upgrade can run. The age check leaves a
# revision that a concurrent run may still be upgrading; a retry after this
# run's own failed attempt passes 0. A pending-install with no earlier revision
# is left alone. Makes one attempt; on a connection error the upgrade's next
# retry tries again.
helm_recover_pending_release() {
  local release="$1" namespace="$2" min_age="$3" plan
  plan=$(command helm history "${release}" -n "${namespace}" --max 20 -o json 2>/dev/null \
    | python3 -c '
import json, re, sys
from datetime import datetime, timezone
try:
    history = sorted(json.load(sys.stdin), key=lambda r: r["revision"])
except Exception:
    sys.exit(0)
if not history or not history[-1]["status"].startswith("pending-"):
    sys.exit(0)
latest = history[-1]
stamp = re.sub(r"(\.\d{6})\d+", r"\1", latest["updated"]).replace("Z", "+00:00")
age = (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds()
good = [r["revision"] for r in history[:-1] if r["status"] in ("deployed", "superseded")]
if age >= int(sys.argv[1]) and good:
    print(latest["revision"], latest["status"], good[-1])
' "${min_age}") || return 0
  [[ -z "${plan}" ]] && return 0

  local pending_revision pending_status target_revision
  read -r pending_revision pending_status target_revision <<< "${plan}"
  echo "[WARN] helm release ${release} revision ${pending_revision} is ${pending_status}; rolling back to revision ${target_revision} so the upgrade can run..." >&2
  command helm rollback "${release}" "${target_revision}" -n "${namespace}" >&2 || true
}

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
  local helm_upgrade="" had_connection_error=""

  if [[ "${bin}" == "helm" ]]; then
    pattern="${HELM_TRANSIENT_ERROR_PATTERN}"
    if [[ "${args[0]:-}" == "upgrade" ]] && _helm_upgrade_target "${args[@]:1}"; then
      helm_upgrade=1
      helm_recover_pending_release "${HELM_UPGRADE_RELEASE}" "${HELM_UPGRADE_NAMESPACE}" "${HELM_PENDING_MIN_AGE_SECONDS}"
    fi
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
    if (( rc == 0 || attempt >= CLUSTER_RETRY_ATTEMPTS )); then
      break
    fi
    if grep -qE "${pattern}" "${err_file}"; then
      had_connection_error=1
      echo "[WARN] ${bin} ${args[0]:-} failed on a connection error (attempt ${attempt}/${CLUSTER_RETRY_ATTEMPTS}); retrying in ${CLUSTER_RETRY_WAIT_SECONDS}s..." >&2
    elif [[ -n "${helm_upgrade}" && -n "${had_connection_error}" ]] \
      && grep -qE "${HELM_PENDING_ERROR_PATTERN}" "${err_file}"; then
      # This run's own earlier attempt left the release pending.
      echo "[WARN] helm upgrade found the release pending after an earlier connection error (attempt ${attempt}/${CLUSTER_RETRY_ATTEMPTS}); retrying in ${CLUSTER_RETRY_WAIT_SECONDS}s..." >&2
    else
      break
    fi
    sleep "${CLUSTER_RETRY_WAIT_SECONDS}"
    if [[ -n "${helm_upgrade}" ]]; then
      helm_recover_pending_release "${HELM_UPGRADE_RELEASE}" "${HELM_UPGRADE_NAMESPACE}" 0
    fi
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
