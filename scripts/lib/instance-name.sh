#!/usr/bin/env bash
#
# instance-name.sh — Derive and sanitize instance names from git branches.
#
# Provides functions to:
#   1. Get the current git branch name
#   2. Sanitize a branch name for Kubernetes naming conventions
#   3. Derive an instance name (from git branch or --instance override)
#   4. Generate resource names (prefixed) and labels for Kubernetes resources
#
# Usage (sourced by other scripts):
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/instance-name.sh"
#   INSTANCE_NAME=$(resolve_instance_name "$@")
#   RESOURCE_NAME=$(get_resource_name "${INSTANCE_NAME}" "backend")
#   INSTANCE_LABEL=$(get_instance_label "${INSTANCE_NAME}")
#

# ---------- internal helpers ----------

# _get_git_branch
#
# Prints the current git branch name to stdout.
# Returns 1 if not in a git repository or in detached HEAD state.
_get_git_branch() {
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return 1

  if [[ "${branch}" == "HEAD" ]]; then
    echo "[ERROR] Git is in detached HEAD state. Use --instance <name> to specify an instance name." >&2
    return 1
  fi

  echo "${branch}"
}

# ---------- public API ----------

# sanitize_instance_name <raw-name>
#
# Sanitizes a raw name (branch name or user-provided name) into a valid
# Kubernetes resource name:
#   - Convert to lowercase
#   - Replace slashes, underscores, dots, and other invalid characters with hyphens
#   - Collapse consecutive hyphens into a single hyphen
#   - Strip leading and trailing hyphens
#   - Truncate to 63 characters (Kubernetes name limit)
#   - Ensure result starts and ends with an alphanumeric character
#
# Prints the sanitized name to stdout.
# Returns 1 if the result is empty after sanitization.
sanitize_instance_name() {
  local raw="$1"
  local sanitized

  # Convert to lowercase
  sanitized="${raw,,}"

  # Replace any character that is not lowercase alphanumeric or hyphen with a hyphen
  sanitized=$(echo "${sanitized}" | sed 's/[^a-z0-9-]/-/g')

  # Collapse consecutive hyphens
  sanitized=$(echo "${sanitized}" | sed 's/-\{2,\}/-/g')

  # Strip leading hyphens
  sanitized="${sanitized#-}"
  # Strip trailing hyphens
  sanitized="${sanitized%-}"

  # Truncate to 63 characters
  sanitized="${sanitized:0:63}"

  # After truncation, strip any trailing hyphen that may have appeared
  sanitized="${sanitized%-}"

  if [[ -z "${sanitized}" ]]; then
    echo "[ERROR] Instance name is empty after sanitization of '${raw}'." >&2
    return 1
  fi

  echo "${sanitized}"
}

# resolve_instance_name [script-args...]
#
# Determines the instance name by either:
#   1. Using the --instance <name> argument if provided (sanitized)
#   2. Deriving from the current git branch name (sanitized)
#
# Prints the resolved instance name to stdout.
# Returns 1 if the instance name cannot be determined.
#
# This function parses --instance from the provided arguments. Other arguments
# are ignored (they pass through to the calling script).
resolve_instance_name() {
  local instance_override=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --instance)
        if [[ -z "${2:-}" ]]; then
          echo "[ERROR] --instance requires a value" >&2
          return 1
        fi
        instance_override="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  if [[ -n "${instance_override}" ]]; then
    sanitize_instance_name "${instance_override}"
    return $?
  fi

  local branch
  branch=$(_get_git_branch) || return 1
  sanitize_instance_name "${branch}"
}

# get_resource_name <instance-name> <service-name>
#
# Generates a prefixed resource name: <instance-name>-<service-name>
# Example: get_resource_name "feature-my-thing" "backend" → "feature-my-thing-backend"
#
# Prints the resource name to stdout.
get_resource_name() {
  local instance="$1"
  local service="$2"
  echo "${instance}-${service}"
}

# get_instance_label <instance-name>
#
# Returns the Kubernetes label for instance identification.
# Example: get_instance_label "feature-my-thing" → "app.kubernetes.io/instance=feature-my-thing"
#
# Prints the label to stdout.
get_instance_label() {
  local instance="$1"
  echo "app.kubernetes.io/instance=${instance}"
}

# get_instance_selector <instance-name>
#
# Returns the label selector for querying resources belonging to an instance.
# Same format as get_instance_label but named distinctly for clarity of intent.
#
# Prints the selector to stdout.
get_instance_selector() {
  local instance="$1"
  echo "app.kubernetes.io/instance=${instance}"
}
