#!/bin/bash
# Claude Capacity Checking Library
# Extracted from ralph.sh for reuse across modes

# ---- Claude capacity guard ----
CLAUDE_USAGE_THRESHOLD="${CLAUDE_USAGE_THRESHOLD:-85}"   # percent
CLAUDE_CREDS_FILE="${CLAUDE_CREDS_FILE:-$HOME/.claude/.credentials.json}"
CLAUDE_RESET_BUFFER_SECONDS="${CLAUDE_RESET_BUFFER_SECONDS:-15}"  # extra cushion

iso_to_epoch() {
  local iso="$1"

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$iso" <<'PY'
import sys, datetime
s = sys.argv[1].strip().replace("Z", "+00:00")
dt = datetime.datetime.fromisoformat(s)
print(int(dt.timestamp()))
PY
    return $?
  fi

  # Fallback (GNU date); strip fractional seconds if present
  local clean
  clean="$(echo "$iso" | sed -E 's/\.[0-9]+//; s/Z/+00:00/')"
  date -d "$clean" +%s
}

check_claude_capacity_or_wait() {
  [[ "$TOOL" == "claude" ]] || return 0

  if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required for Claude usage checks." >&2
    exit 2
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required for Claude usage checks." >&2
    exit 2
  fi
  if [[ ! -f "$CLAUDE_CREDS_FILE" ]]; then
    echo "Error: Claude credentials not found at: $CLAUDE_CREDS_FILE" >&2
    echo "Run 'claude' once to log in, then retry." >&2
    exit 2
  fi

  local token
  token="$(jq -r '.claudeAiOauth.accessToken // empty' "$CLAUDE_CREDS_FILE")"
  if [[ -z "$token" || "$token" == "null" ]]; then
    echo "Error: No access token found in $CLAUDE_CREDS_FILE (expected .claudeAiOauth.accessToken)" >&2
    exit 2
  fi

  while true; do
    local tmp http usage_json util reset_at

    tmp="$(mktemp)"
    http="$(
      curl -sS -o "$tmp" -w '%{http_code}' \
        -H 'Accept: application/json, text/plain, */*' \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer ${token}" \
        -H 'anthropic-beta: oauth-2025-04-20' \
        'https://api.anthropic.com/api/oauth/usage' || echo "000"
    )"

    if [[ "$http" != "200" ]]; then
      rm -f "$tmp"
      if [[ "$http" == "401" || "$http" == "403" ]]; then
        echo "Claude usage check failed with HTTP $http (auth). Re-run 'claude' to refresh login." >&2
        exit 2
      fi
      echo "Claude usage check failed with HTTP $http; retrying in 60s..." >&2
      sleep 60
      continue
    fi

    usage_json="$(cat "$tmp")"
    rm -f "$tmp"

    util="$(jq -r '.five_hour.utilization // empty' <<<"$usage_json")"
    reset_at="$(jq -r '.five_hour.resets_at // empty' <<<"$usage_json")"

    if [[ -z "$util" || "$util" == "null" ]]; then
      echo "Could not read five_hour.utilization; retrying in 60s..." >&2
      sleep 60
      continue
    fi

    # If util <= threshold, we can proceed
    if awk -v u="$util" -v t="$CLAUDE_USAGE_THRESHOLD" 'BEGIN{ exit !(u > t) }'; then
      # Over limit: sleep until reset time (plus buffer), then re-check
      if [[ -z "$reset_at" || "$reset_at" == "null" ]]; then
        echo "Claude session usage is ${util}% (> ${CLAUDE_USAGE_THRESHOLD}%), but no resets_at. Sleeping 5 minutes..."
        sleep 300
        continue
      fi

      local reset_epoch now sleep_for
      reset_epoch="$(iso_to_epoch "$reset_at" 2>/dev/null || echo "")"
      now="$(date +%s)"

      if [[ -z "$reset_epoch" ]]; then
        echo "Claude session usage is ${util}% (> ${CLAUDE_USAGE_THRESHOLD}%). Couldn't parse resets_at='$reset_at'. Sleeping 5 minutes..."
        sleep 300
        continue
      fi

      sleep_for=$(( reset_epoch - now + CLAUDE_RESET_BUFFER_SECONDS ))
      if (( sleep_for < 5 )); then sleep_for=5; fi

      echo "Claude session usage is ${util}% (> ${CLAUDE_USAGE_THRESHOLD}%). Sleeping ${sleep_for}s until after reset (${reset_at})..."
      sleep "$sleep_for"
      continue
    fi

    # Under threshold
    return 0
  done
}
