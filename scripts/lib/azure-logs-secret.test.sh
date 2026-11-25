#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/azure-logs-secret.sh"

export AZURE_LOGS_TENANT_ID=test-tenant
export AZURE_LOGS_CLIENT_ID=test-client
export AZURE_LOGS_CLIENT_SECRET='test secret with $ and " and ='
export AZURE_LOGS_DCE_URL=https://test.example.invalid
export AZURE_LOGS_DCR_ID=dcr-test
export AZURE_LOGS_TABLE_NAME=Test_CL
validate_azure_logs_config

if (unset AZURE_LOGS_CLIENT_SECRET; validate_azure_logs_config) 2>/dev/null; then
  echo "FAIL: missing client secret was accepted" >&2
  exit 1
fi
if (export AZURE_LOGS_DCE_URL=http://test.example.invalid; validate_azure_logs_config) 2>/dev/null; then
  echo "FAIL: insecure endpoint was accepted" >&2
  exit 1
fi
if (export AZURE_LOGS_DCR_ID=/subscriptions/test; validate_azure_logs_config) 2>/dev/null; then
  echo "FAIL: ARM resource ID was accepted" >&2
  exit 1
fi

# Every required setting present: the mirror is deployed, without a warning.
configured_output=$(azure_logs_mirror_configured 2>&1)
[[ -z "${configured_output}" ]] || {
  echo "FAIL: unexpected output with every setting present: ${configured_output}" >&2
  exit 1
}

# No settings: deploy without the mirror, silently. The table name alone does not count.
none_output=$(
  unset AZURE_LOGS_TENANT_ID AZURE_LOGS_CLIENT_ID AZURE_LOGS_CLIENT_SECRET \
    AZURE_LOGS_DCE_URL AZURE_LOGS_DCR_ID
  azure_logs_mirror_configured 2>&1
) && {
  echo "FAIL: mirror counted as configured with no settings" >&2
  exit 1
}
[[ -z "${none_output}" ]] || {
  echo "FAIL: unexpected output with no settings: ${none_output}" >&2
  exit 1
}

# Some settings: deploy without the mirror, naming what is missing and no values.
partial_output=$(
  unset AZURE_LOGS_CLIENT_SECRET AZURE_LOGS_DCR_ID
  azure_logs_mirror_configured 2>&1
) && {
  echo "FAIL: partial settings counted as configured" >&2
  exit 1
}
[[ "${partial_output}" == *"AZURE_LOGS_CLIENT_SECRET AZURE_LOGS_DCR_ID not set"* ]] || {
  echo "FAIL: partial warning does not name the missing settings: ${partial_output}" >&2
  exit 1
}
[[ "${partial_output}" != *test-tenant* && "${partial_output}" != *test-client* ]] || {
  echo "FAIL: partial warning printed a setting's value" >&2
  exit 1
}

TEST_TMP=$(mktemp -d)
trap 'rmdir -- "${TEST_TMP}"' EXIT
export TMPDIR="${TEST_TMP}"

oc() {
  case "$1" in
    create)
      [[ "$*" != *"${AZURE_LOGS_CLIENT_SECRET}"* ]]
      [[ "$*" == *"test-instance-azure-logs-secrets"* ]]
      local arg file key value count=0
      for arg in "$@"; do
        if [[ "${arg}" == --from-file=* ]]; then
          file="${arg#--from-file=}"
          key="${file%%=*}"
          file="${file#*=}"
          [[ "$(stat -c %a "${file}")" == 600 ]]
          value=$(printenv "${key}")
          [[ "$(cat "${file}")" == "${value}" ]]
          [[ "$(wc -c < "${file}")" -eq "${#value}" ]]
          count=$((count + 1))
        fi
      done
      [[ "${count}" -eq 6 ]]
      printf 'test-secret-manifest'
      ;;
    apply)
      [[ "$(cat)" == test-secret-manifest ]]
      return "${APPLY_EXIT_CODE:-0}"
      ;;
    label)
      echo "instance label applied"
      ;;
    *)
      echo "Unexpected oc call" >&2
      return 1
      ;;
  esac
}

result=$(apply_azure_logs_secret test-namespace test-instance)
[[ "${result}" == "instance label applied" ]]
[[ -z "$(find "${TEST_TMP}" -mindepth 1 -print -quit)" ]]

export APPLY_EXIT_CODE=42
if result=$(apply_azure_logs_secret test-namespace test-instance); then
  echo "FAIL: apply failure was ignored" >&2
  exit 1
fi
[[ "${result}" != *"instance label applied"* ]]
[[ -z "$(find "${TEST_TMP}" -mindepth 1 -print -quit)" ]]
echo "Azure log mirror on/off decision, Secret validation, values, permissions, cleanup, and failure propagation passed."
