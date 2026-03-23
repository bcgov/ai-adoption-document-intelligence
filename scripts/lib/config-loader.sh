#!/usr/bin/env bash
#
# config-loader.sh — Load and merge environment configuration files.
#
# Provides functions to:
#   1. Load a base environment profile (dev or prod)
#   2. Merge instance-specific overrides on top of profile defaults
#   3. Export the merged configuration as environment variables
#
# Usage (sourced by other scripts):
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/config-loader.sh"
#   load_config --env dev --instance my-instance
#
# The merge order is:
#   1. Profile defaults (deployments/openshift/config/<env>.env)
#   2. Instance overrides (deployments/openshift/config/<instance>.env) — optional
#
# Instance values take precedence over profile defaults.
#

# Resolve paths relative to this file
_CONFIG_LOADER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_PROJECT_ROOT="$(cd "${_CONFIG_LOADER_DIR}/../.." && pwd)"
_CONFIG_DIR="${_PROJECT_ROOT}/deployments/openshift/config"

# Associative array holding the merged configuration
declare -gA CONFIG_VALUES

# ---------- internal helpers ----------

# Parse a .env file into the CONFIG_VALUES associative array.
# Existing keys are overwritten (enabling the merge/override pattern).
# Lines starting with # and blank lines are skipped.
# Supports KEY=VALUE and KEY="VALUE" (strips outer double quotes).
_parse_env_file() {
  local file="$1"

  if [[ ! -f "${file}" ]]; then
    return 1
  fi

  while IFS= read -r line || [[ -n "${line}" ]]; do
    # Skip blank lines and comments
    [[ -z "${line}" ]] && continue
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue

    # Split on first '='
    local key="${line%%=*}"
    local value="${line#*=}"

    # Trim leading/trailing whitespace from key
    key="$(echo "${key}" | xargs)"

    # Skip if key is empty
    [[ -z "${key}" ]] && continue

    # Strip surrounding double quotes from value if present
    if [[ "${value}" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi

    CONFIG_VALUES["${key}"]="${value}"
  done < "${file}"
}

# ---------- public API ----------

# load_config --env <profile> [--instance <instance-name>]
#
# Loads the base profile configuration and optionally merges
# instance-specific overrides on top.
#
# Arguments:
#   --env <profile>        Required. Either "dev" or "prod".
#   --instance <name>      Optional. Instance name for override file lookup.
#
# Returns:
#   0 on success
#   1 if the profile env file is not found
#   2 if an invalid profile is specified
load_config() {
  local profile=""
  local instance=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env)
        profile="$2"
        shift 2
        ;;
      --instance)
        instance="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  if [[ -z "${profile}" ]]; then
    echo "[ERROR] --env is required (dev or prod)" >&2
    return 2
  fi

  if [[ "${profile}" != "dev" && "${profile}" != "prod" ]]; then
    echo "[ERROR] Invalid profile '${profile}'. Must be 'dev' or 'prod'." >&2
    return 2
  fi

  # Reset config
  CONFIG_VALUES=()

  # Step 1: Load base profile
  local profile_file="${_CONFIG_DIR}/${profile}.env"
  if [[ ! -f "${profile_file}" ]]; then
    echo "[ERROR] Profile configuration file not found: ${profile_file}" >&2
    if [[ -f "${profile_file}.example" ]]; then
      echo "[ERROR] An example file exists at ${profile_file}.example" >&2
      echo "[ERROR] Copy it to get started: cp ${profile_file}.example ${profile_file}" >&2
    fi
    return 1
  fi

  echo "[INFO] Loading base profile: ${profile_file}"
  _parse_env_file "${profile_file}"

  # Step 2: Merge instance overrides if specified and file exists
  if [[ -n "${instance}" ]]; then
    local instance_file="${_CONFIG_DIR}/${instance}.env"
    if [[ -f "${instance_file}" ]]; then
      echo "[INFO] Merging instance overrides: ${instance_file}"
      _parse_env_file "${instance_file}"
    else
      echo "[INFO] No instance override file found at ${instance_file} — using profile defaults only."
    fi
  fi

  return 0
}

# export_config
#
# Exports all loaded CONFIG_VALUES as environment variables.
export_config() {
  for key in "${!CONFIG_VALUES[@]}"; do
    export "${key}=${CONFIG_VALUES[${key}]}"
  done
}

# get_config <key>
#
# Retrieves a single configuration value by key.
# Prints the value to stdout. Returns 1 if key not found.
get_config() {
  local key="$1"
  if [[ -v CONFIG_VALUES["${key}"] ]]; then
    echo "${CONFIG_VALUES[${key}]}"
    return 0
  fi
  return 1
}

# print_config
#
# Prints all loaded configuration key=value pairs to stdout (sorted).
print_config() {
  for key in $(echo "${!CONFIG_VALUES[@]}" | tr ' ' '\n' | sort); do
    echo "${key}=${CONFIG_VALUES[${key}]}"
  done
}

# get_config_dir
#
# Returns the path to the config directory.
get_config_dir() {
  echo "${_CONFIG_DIR}"
}
