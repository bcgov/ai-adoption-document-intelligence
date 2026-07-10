#!/bin/bash
# Thin authenticated wrapper around the Jira Cloud REST API.
# Credentials are read from a file OUTSIDE the repo and never printed.
# The API token is fed to curl via stdin (-K -) so it never appears in `ps`
# process arguments or in this script's output.
#
# Usage:
#   jira-api.sh <METHOD> <path> [json-body]
# Examples:
#   jira-api.sh GET  /rest/api/3/myself
#   jira-api.sh GET  "/rest/api/3/search?jql=project=AI&maxResults=5"
#   jira-api.sh POST /rest/api/3/issue '{"fields":{...}}'
set -euo pipefail

CRED="${JIRA_CREDENTIALS_FILE:-$HOME/.config/jira/credentials.env}"
if [ ! -f "$CRED" ]; then
  echo "ERROR: Jira credentials file not found at $CRED" >&2
  echo "Create it with JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (chmod 600)." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$CRED"
set +a

: "${JIRA_BASE_URL:?JIRA_BASE_URL missing from credentials file}"
: "${JIRA_EMAIL:?JIRA_EMAIL missing from credentials file}"
: "${JIRA_API_TOKEN:?JIRA_API_TOKEN missing from credentials file}"

METHOD="${1:?usage: jira-api.sh <METHOD> <path> [json-body]}"
PATHPART="${2:?usage: jira-api.sh <METHOD> <path> [json-body]}"
BODY="${3:-}"

args=(-sS -X "$METHOD" -H "Accept: application/json")
if [ -n "$BODY" ]; then
  args+=(-H "Content-Type: application/json" --data "$BODY")
fi

# Feed the -u credentials through a curl config on stdin so the token
# is never visible in the process argument list.
curl "${args[@]}" -K - "$JIRA_BASE_URL$PATHPART" <<CURLCFG
user = "$JIRA_EMAIL:$JIRA_API_TOKEN"
CURLCFG
