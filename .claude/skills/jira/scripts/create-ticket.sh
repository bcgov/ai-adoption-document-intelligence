#!/bin/bash
# Create a Jira issue in project AI, always tagged to the "AI Technical
# Solutions Team" (the team every board-721 backlog ticket uses).
#
# Usage:
#   create-ticket.sh "Summary text" [IssueType] [Description text]
#
# IssueType defaults to "Task". Valid: Task, Story, Bug, Epic, Initiative.
# Reporter defaults to the authenticated user (the token owner).
set -euo pipefail

SUMMARY="${1:?usage: create-ticket.sh \"Summary\" [IssueType] [Description]}"
ITYPE="${2:-Task}"
DESC="${3:-}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEAM_ID="16e1d32f-a986-42d4-bda6-55c25f4a765b"  # AI Technical Solutions Team

payload=$(SUMMARY="$SUMMARY" ITYPE="$ITYPE" DESC="$DESC" TEAM_ID="$TEAM_ID" python3 -c '
import os, json
desc = os.environ["DESC"].strip()
content = ([{"type": "paragraph",
             "content": [{"type": "text", "text": desc}]}]
           if desc else [{"type": "paragraph", "content": []}])
print(json.dumps({"fields": {
    "project": {"key": "AI"},
    "issuetype": {"name": os.environ["ITYPE"]},
    "summary": os.environ["SUMMARY"],
    "customfield_10001": os.environ["TEAM_ID"],
    "description": {"type": "doc", "version": 1, "content": content},
}}))')

bash "$DIR/jira-api.sh" POST /rest/api/3/issue "$payload"
