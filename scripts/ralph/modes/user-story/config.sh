#!/bin/bash
# User Story Mode Configuration

MODE_NAME="user-story"
PRD_FILE="$STATE_DIR/prd.json"
PROGRESS_FILE="$STATE_DIR/progress.txt"

mode_validate_args() {
  if [[ ! -f "$PRD_FILE" ]]; then
    echo "Error: prd.json not found at $PRD_FILE"
    echo "Run: node scripts/ralph/convert-stories-to-prd.js <user_stories_dir> [branch_name]"
    exit 1
  fi
}

mode_init() {
  if [[ ! -f "$PROGRESS_FILE" ]]; then
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
}

mode_get_prompt_file() {
  if [[ "$TOOL" == "amp" ]]; then
    echo "$MODE_DIR/prompt.md"
  else
    echo "$MODE_DIR/CLAUDE.md"
  fi
}

mode_is_complete() {
  # Check if all stories have passes: true
  local incomplete_count
  incomplete_count=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE")
  [[ "$incomplete_count" -eq 0 ]]
}

mode_archive() {
  local archive_folder="$1"
  [[ -f "$PRD_FILE" ]] && cp "$PRD_FILE" "$archive_folder/"
  [[ -f "$PROGRESS_FILE" ]] && cp "$PROGRESS_FILE" "$archive_folder/"
}

mode_reset() {
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
}

mode_get_branch_name() {
  jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo ""
}
