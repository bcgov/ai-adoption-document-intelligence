#!/usr/bin/env bash
#
# image-tag.sh — Sanitize git branch names into Docker/OCI image tag segments.
#
# Mirrors the workflow_dispatch branch→tag rules in .github/workflows/deploy-instance.yml.
#

# sanitize_branch_as_image_tag [raw-branch]
#
# If raw-branch is omitted, uses the current git branch. Prints a lowercase tag
# safe for Artifactory (alphanumeric, dots, underscores, hyphens), max 128 chars.
# Returns 1 if not in a git repo or on detached HEAD when no argument is given.
sanitize_branch_as_image_tag() {
  local raw="${1:-}"
  if [[ -z "${raw}" ]]; then
    raw=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return 1
    if [[ "${raw}" == "HEAD" ]]; then
      echo "[ERROR] Detached HEAD: pass an explicit tag (--tag) or branch name argument." >&2
      return 1
    fi
  fi

  echo "${raw}" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' \
    | cut -c1-128
}
