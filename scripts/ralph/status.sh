#!/usr/bin/env bash
# Show current Ralph status in a human-friendly format

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"

if [[ ! -f "$PRD_FILE" ]]; then
    echo "❌ No prd.json found. Create one first with:"
    echo "   node scripts/ralph/convert-stories-to-prd.js <user_stories_dir>"
    exit 1
fi

echo "📊 Ralph Status Report"
echo "======================="
echo ""

# Branch info
BRANCH=$(jq -r '.branchName' "$PRD_FILE")
echo "🔀 Target Branch: $BRANCH"

# Current git branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [[ "$CURRENT_BRANCH" == "$BRANCH" ]]; then
    echo "   ✅ Currently on target branch"
else
    echo "   ⚠️  Currently on: $CURRENT_BRANCH (expected: $BRANCH)"
fi

echo ""

# Story statistics
TOTAL=$(jq '.userStories | length' "$PRD_FILE")
COMPLETED=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE")
PENDING=$(jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE")
PERCENTAGE=$((COMPLETED * 100 / TOTAL))

echo "📈 Progress: $COMPLETED/$TOTAL completed ($PERCENTAGE%)"
echo ""

# Completed stories
if [[ $COMPLETED -gt 0 ]]; then
    echo "✅ Completed Stories:"
    jq -r '.userStories[] | select(.passes == true) | "   \(.id): \(.title)"' "$PRD_FILE"
    echo ""
fi

# Pending stories (in implementation order)
if [[ $PENDING -gt 0 ]]; then
    echo "⏳ Pending Stories (in implementation order):"
    jq -r '.userStories[] | select(.passes == false) | "   \(.id): \(.title) (Priority \(.priority))"' "$PRD_FILE"
    echo ""

    # Next story to implement (first pending in order)
    echo "🎯 Next Story:"
    NEXT=$(jq -r '[.userStories[] | select(.passes == false)] | first | "   \(.id): \(.title) (Priority \(.priority))"' "$PRD_FILE")
    echo "$NEXT"
    echo ""
fi

# Recent commits on this branch (if on the branch)
if [[ "$CURRENT_BRANCH" == "$BRANCH" ]]; then
    echo "📝 Recent Commits:"
    git log --oneline -5 2>/dev/null | sed 's/^/   /' || echo "   (no commits yet)"
    echo ""
fi

# Notes from completed stories
NOTES_COUNT=$(jq '[.userStories[] | select(.notes != "")] | length' "$PRD_FILE")
if [[ $NOTES_COUNT -gt 0 ]]; then
    echo "📌 Stories with Notes:"
    jq -r '.userStories[] | select(.notes != "") | "   \(.id): \(.notes)"' "$PRD_FILE"
    echo ""
fi

# Overall status
if [[ $PENDING -eq 0 ]]; then
    echo "🎉 All stories completed! Ready to merge."
else
    echo "🚧 $PENDING stories remaining"
    echo ""
    echo "To continue, run:"
    echo "   ./scripts/ralph/ralph.sh 25"
fi
