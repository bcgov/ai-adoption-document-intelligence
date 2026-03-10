#!/bin/bash
# Test Fixer Mode Configuration

MODE_NAME="test-fixer"
PRD_FILE="$STATE_DIR/prd.json"
TEST_FOLDER=""
FEATURE_DIR=""
PROGRESS_FILE=""

mode_validate_args() {
  if [[ ! -f "$PRD_FILE" ]]; then
    echo "Error: prd.json not found at $PRD_FILE"
    echo ""
    echo "Generate it with:"
    echo "  1. node scripts/ralph/generate-test-progress.js <test_folder> <feature_dir>"
    echo "  2. node scripts/ralph/convert-tests-to-progress.js <test_folder> <feature_dir>"
    echo ""
    echo "Example:"
    echo "  node scripts/ralph/generate-test-progress.js benchmarking feature-docs/003-benchmarking-system/"
    echo "  node scripts/ralph/convert-tests-to-progress.js benchmarking feature-docs/003-benchmarking-system/"
    exit 1
  fi

  # Verify it's a test-fixer mode prd.json
  local mode_type
  mode_type=$(jq -r '.mode // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [[ "$mode_type" != "test-fixer" ]]; then
    echo "Error: prd.json is not for test-fixer mode (mode='$mode_type')"
    echo "Convert test progress with:"
    echo "  node scripts/ralph/convert-tests-to-progress.js <test_folder> <feature_dir>"
    exit 1
  fi

  # Extract configuration from prd.json
  TEST_FOLDER=$(jq -r '.testFolder // empty' "$PRD_FILE")
  FEATURE_DIR=$(jq -r '.featureDir // empty' "$PRD_FILE")
  PROGRESS_FILE=$(jq -r '.progressFile // empty' "$PRD_FILE")

  # Export for use in prompts
  export TEST_FOLDER
  export FEATURE_DIR
  export PROGRESS_FILE
  export PRD_FILE
}

mode_init() {
  # prd.json already exists and was validated
  # No additional initialization needed
  :
}

mode_get_prompt_file() {
  if [[ "$TOOL" == "amp" ]]; then
    echo "$MODE_DIR/prompt.md"
  else
    echo "$MODE_DIR/CLAUDE.md"
  fi
}

mode_is_complete() {
  # Check if all test files have passes: true
  local incomplete_count
  incomplete_count=$(jq '[.testFiles[] | select(.passes == false)] | length' "$PRD_FILE")
  [[ "$incomplete_count" -eq 0 ]]
}

mode_archive() {
  local archive_folder="$1"
  [[ -f "$PRD_FILE" ]] && cp "$PRD_FILE" "$archive_folder/"
  [[ -f "$PROGRESS_FILE" ]] && cp "$PROGRESS_FILE" "$archive_folder/"
}

mode_reset() {
  echo "Warning: test-fixer prd.json preserved. Re-run convert-tests-to-progress.js if needed."
}

mode_get_branch_name() {
  # Test fixer doesn't track branch name - return current branch
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""
}
