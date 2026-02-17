#!/bin/bash
# Ralph - Multi-mode autonomous agent loop
# Usage: ./ralph.sh [--mode <mode>] [--tool amp|claude] [mode_args...] [max_iterations]

set -e

# ============================================================================
# ARGUMENT PARSING
# ============================================================================
MODE="user-story"  # Default mode for backward compatibility
TOOL="amp"         # Default tool
MAX_ITERATIONS=10
MODE_ARGS=()       # Extra args passed to mode

while [[ $# -gt 0 ]]; do
  case $1 in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --mode=*)
      MODE="${1#*=}"
      shift
      ;;
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      else
        MODE_ARGS+=("$1")
      fi
      shift
      ;;
  esac
done

# ============================================================================
# SETUP
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE_DIR="$SCRIPT_DIR/modes/$MODE"
STATE_DIR="$SCRIPT_DIR/state"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LIB_DIR="$SCRIPT_DIR/lib"

# Validate mode exists
if [[ ! -d "$MODE_DIR" ]]; then
  echo "Error: Unknown mode '$MODE'. Available modes:"
  ls -1 "$SCRIPT_DIR/modes/" 2>/dev/null | sed 's/^/  - /' || echo "  (no modes found)"
  exit 1
fi

# Validate tool
if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'."
  exit 1
fi

# Load shared libraries
source "$LIB_DIR/claude-capacity.sh"
source "$LIB_DIR/archive.sh"
source "$LIB_DIR/completion.sh"

# Load mode configuration
source "$MODE_DIR/config.sh"

# ============================================================================
# MODE INITIALIZATION
# ============================================================================
mode_validate_args "${MODE_ARGS[@]}"
mode_init

# ============================================================================
# ARCHIVING LOGIC (mode-aware)
# ============================================================================
handle_branch_change

# ============================================================================
# ITERATION LOOP
# ============================================================================
echo "Starting Ralph - Mode: $MODE - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"

# Check Claude capacity before starting
check_claude_capacity_or_wait

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($MODE / $TOOL)"
  echo "==============================================================="

  # Check Claude capacity at the start of every iteration
  check_claude_capacity_or_wait

  # Get mode-specific prompt file
  PROMPT_FILE=$(mode_get_prompt_file)

  # Run the tool with the prompt file
  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cat "$PROMPT_FILE" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  else
    OUTPUT=$(claude --dangerously-skip-permissions --print < "$PROMPT_FILE" 2>&1 | tee /dev/stderr) || true
  fi

  # Check for completion
  if is_complete "$OUTPUT"; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check mode state files for status."
exit 1
