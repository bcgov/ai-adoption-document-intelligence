#!/usr/bin/env bash

# Validate settings without printing credentials.
validate_azure_logs_config() {
  local key missing=false
  for key in AZURE_LOGS_TENANT_ID AZURE_LOGS_CLIENT_ID AZURE_LOGS_CLIENT_SECRET \
    AZURE_LOGS_DCE_URL AZURE_LOGS_DCR_ID AZURE_LOGS_TABLE_NAME; do
    if [[ -z "$(printenv "${key}")" ]]; then
      echo "[ERROR] Required Azure log mirror setting is missing: ${key}" >&2
      missing=true
    fi
  done
  [[ "${missing}" == false ]] || return 1
  if [[ "${AZURE_LOGS_DCE_URL}" != https://* ]]; then
    echo "[ERROR] AZURE_LOGS_DCE_URL must be an HTTPS logs ingestion endpoint." >&2
    return 1
  fi
  if [[ "${AZURE_LOGS_DCR_ID}" != dcr-* ]]; then
    echo "[ERROR] AZURE_LOGS_DCR_ID must be the immutable DCR ID (dcr-...), not an ARM resource ID." >&2
    return 1
  fi
}

# Provision one instance-owned Secret without credentials in command arguments.
apply_azure_logs_secret() (
  set -euo pipefail
  local namespace="$1" instance="$2" tmp
  validate_azure_logs_config || exit $?
  umask 077
  tmp=$(mktemp -d) || exit $?
  trap 'rm -f -- "$tmp/AZURE_LOGS_TENANT_ID" "$tmp/AZURE_LOGS_CLIENT_ID" "$tmp/AZURE_LOGS_CLIENT_SECRET" "$tmp/AZURE_LOGS_DCE_URL" "$tmp/AZURE_LOGS_DCR_ID" "$tmp/AZURE_LOGS_TABLE_NAME"; rmdir -- "$tmp"' EXIT

  printf '%s' "${AZURE_LOGS_TENANT_ID}" > "${tmp}/AZURE_LOGS_TENANT_ID" || exit $?
  printf '%s' "${AZURE_LOGS_CLIENT_ID}" > "${tmp}/AZURE_LOGS_CLIENT_ID" || exit $?
  printf '%s' "${AZURE_LOGS_CLIENT_SECRET}" > "${tmp}/AZURE_LOGS_CLIENT_SECRET" || exit $?
  printf '%s' "${AZURE_LOGS_DCE_URL}" > "${tmp}/AZURE_LOGS_DCE_URL" || exit $?
  printf '%s' "${AZURE_LOGS_DCR_ID}" > "${tmp}/AZURE_LOGS_DCR_ID" || exit $?
  printf '%s' "${AZURE_LOGS_TABLE_NAME}" > "${tmp}/AZURE_LOGS_TABLE_NAME" || exit $?

  oc create secret generic "${instance}-azure-logs-secrets" \
    --namespace "${namespace}" \
    --from-file="AZURE_LOGS_TENANT_ID=${tmp}/AZURE_LOGS_TENANT_ID" \
    --from-file="AZURE_LOGS_CLIENT_ID=${tmp}/AZURE_LOGS_CLIENT_ID" \
    --from-file="AZURE_LOGS_CLIENT_SECRET=${tmp}/AZURE_LOGS_CLIENT_SECRET" \
    --from-file="AZURE_LOGS_DCE_URL=${tmp}/AZURE_LOGS_DCE_URL" \
    --from-file="AZURE_LOGS_DCR_ID=${tmp}/AZURE_LOGS_DCR_ID" \
    --from-file="AZURE_LOGS_TABLE_NAME=${tmp}/AZURE_LOGS_TABLE_NAME" \
    --dry-run=client -o yaml | oc apply -f - --namespace "${namespace}" || exit $?
  oc label secret "${instance}-azure-logs-secrets" \
    "app.kubernetes.io/instance=${instance}" --overwrite --namespace "${namespace}"
)
