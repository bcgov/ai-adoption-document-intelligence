#!/bin/bash
# Completion Detection Library
# Wrapper for mode-specific completion detection

is_complete() {
  local output="$1"

  # Check for explicit completion marker in output
  if echo "$output" | grep -q "^<promise>COMPLETE</promise>$"; then
    return 0
  fi

  # Fallback to mode-specific completion check
  mode_is_complete
  return $?
}
