#!/bin/bash
# Archiving Library
# Extracted from ralph.sh for reuse across modes

handle_branch_change() {
  local current_branch last_branch

  current_branch=$(mode_get_branch_name)

  if [[ -f "$STATE_DIR/.last-branch" ]]; then
    last_branch=$(cat "$STATE_DIR/.last-branch" 2>/dev/null || echo "")
  else
    last_branch=""
  fi

  if [[ -n "$current_branch" ]] && [[ -n "$last_branch" ]] && [[ "$current_branch" != "$last_branch" ]]; then
    local date folder_name archive_folder
    date=$(date +%Y-%m-%d)
    folder_name=$(echo "$last_branch" | sed 's|^ralph/||')
    archive_folder="$ARCHIVE_DIR/$date-$folder_name"

    echo "Archiving previous run: $last_branch"
    mkdir -p "$archive_folder"

    # Call mode-specific archiving
    mode_archive "$archive_folder"

    echo "   Archived to: $archive_folder"

    # Reset mode state
    mode_reset
  fi

  # Track current branch
  if [[ -n "$current_branch" ]]; then
    echo "$current_branch" > "$STATE_DIR/.last-branch"
  fi
}
