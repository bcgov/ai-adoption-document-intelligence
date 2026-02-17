#!/bin/bash
# Test Fixer Mode Configuration

MODE_NAME="test-fixer"
TEST_FOLDER=""
FEATURE_DIR=""
PROGRESS_FILE=""

mode_validate_args() {
  if [[ ${#MODE_ARGS[@]} -lt 2 ]]; then
    echo "Error: test-fixer mode requires 2 arguments: <test_folder> <feature_dir>"
    echo "Usage: ralph.sh --mode test-fixer benchmarking feature-docs/003-benchmarking-system/"
    echo ""
    echo "Or generate progress file first:"
    echo "  node scripts/ralph/convert-tests-to-progress.js benchmarking feature-docs/003-benchmarking-system/"
    exit 1
  fi

  TEST_FOLDER="${MODE_ARGS[0]}"
  FEATURE_DIR="${MODE_ARGS[1]}"
  PROGRESS_FILE="$FEATURE_DIR/playwright/test-fixer-progress.md"

  local test_dir="tests/e2e/$TEST_FOLDER"
  if [[ ! -d "$test_dir" ]]; then
    echo "Error: Test directory not found: $test_dir"
    exit 1
  fi

  if [[ ! -d "$FEATURE_DIR" ]]; then
    echo "Error: Feature directory not found: $FEATURE_DIR"
    exit 1
  fi

  # Export for use in prompts
  export TEST_FOLDER
  export FEATURE_DIR
  export PROGRESS_FILE
}

mode_init() {
  # Progress file should be created by convert-tests-to-progress.js
  # If it doesn't exist, suggest running that script
  if [[ ! -f "$PROGRESS_FILE" ]]; then
    echo "Error: Progress file not found: $PROGRESS_FILE"
    echo "Run: node scripts/ralph/convert-tests-to-progress.js $TEST_FOLDER $FEATURE_DIR"
    exit 1
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
  # Check if all tests are checked off
  local unchecked_count
  unchecked_count=$(grep -c "^- \[ \]" "$PROGRESS_FILE" 2>/dev/null || echo "0")
  [[ "$unchecked_count" -eq 0 ]]
}

mode_archive() {
  local archive_folder="$1"
  [[ -f "$PROGRESS_FILE" ]] && cp "$PROGRESS_FILE" "$archive_folder/"
}

mode_reset() {
  # Don't auto-reset test-fixer progress - user should manually clear
  echo "Warning: test-fixer progress file preserved. Clear manually if needed."
}

mode_get_branch_name() {
  # Test fixer doesn't track branch name - return current branch
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""
}
