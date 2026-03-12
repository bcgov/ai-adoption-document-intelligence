#!/usr/bin/env bash
# Quick setup verification script for Ralph

set -e

echo "🔍 Checking Ralph setup..."
echo ""

# Check jq
if command -v jq &> /dev/null; then
    echo "✅ jq is installed ($(jq --version))"
else
    echo "❌ jq is NOT installed"
    echo "   Install with: sudo apt-get install -y jq"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js is installed ($(node --version))"
else
    echo "❌ Node.js is NOT installed"
    exit 1
fi

# Check claude command
if command -v claude &> /dev/null; then
    echo "✅ Claude Code CLI is available"
else
    echo "❌ claude command not found"
    echo "   Make sure Claude Code is installed and in PATH"
    exit 1
fi

# Check required files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/ralph.sh" ]]; then
    echo "✅ ralph.sh exists"
else
    echo "❌ ralph.sh not found"
    exit 1
fi

if [[ -f "$SCRIPT_DIR/prompt.md" ]]; then
    echo "✅ prompt.md exists"
else
    echo "❌ prompt.md not found"
    exit 1
fi

if [[ -f "$SCRIPT_DIR/progress.txt" ]]; then
    echo "✅ progress.txt exists"
else
    echo "❌ progress.txt not found"
    exit 1
fi

if [[ -f "$SCRIPT_DIR/convert-stories-to-prd.js" ]]; then
    echo "✅ convert-stories-to-prd.js exists"
else
    echo "❌ convert-stories-to-prd.js not found"
    exit 1
fi

# Check if prd.json exists
if [[ -f "$SCRIPT_DIR/prd.json" ]]; then
    echo "✅ prd.json exists"
    STORY_COUNT=$(jq '.userStories | length' "$SCRIPT_DIR/prd.json")
    COMPLETED=$(jq '[.userStories[] | select(.passes == true)] | length' "$SCRIPT_DIR/prd.json")
    echo "   Stories: $COMPLETED/$STORY_COUNT completed"
else
    echo "⚠️  prd.json not found (you need to create it from user stories)"
    echo "   Run: node scripts/ralph/convert-stories-to-prd.js <user_stories_dir>"
fi

echo ""
echo "✨ Ralph setup verification complete!"
echo ""
echo "Next steps:"
echo "1. Create user stories with /write-user-stories"
echo "2. Convert to prd.json: node scripts/ralph/convert-stories-to-prd.js <dir>"
echo "3. Configure Claude Code permissions (see README.md)"
echo "4. Run: ./scripts/ralph/ralph.sh 25"
