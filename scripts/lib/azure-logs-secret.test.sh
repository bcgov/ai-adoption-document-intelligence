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
echo "Azure log Secret validation, values, permissions, cleanup, and failure propagation passed."
