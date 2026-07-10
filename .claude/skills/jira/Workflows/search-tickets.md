# Workflow: Search / List Tickets

## JQL search (Jira Platform v3)

```bash
bash .claude/skills/jira/scripts/jira-api.sh GET \
  "/rest/api/3/search?jql=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' \
    'project = AI AND statusCategory != Done ORDER BY updated DESC')&maxResults=20&fields=summary,status,issuetype,assignee"
```

URL-encode the JQL (as above) — spaces and `=` break the query otherwise.

Useful JQL snippets:

- My open tickets: `project = AI AND assignee = currentUser() AND statusCategory != Done`
- Team's tickets: `project = AI AND "Team[Team]" = "AI Technical Solutions Team"`
- Recently updated: `project = AI ORDER BY updated DESC`
- By text: `project = AI AND text ~ "OCR"`

Pretty-print the result:

```bash
bash .claude/skills/jira/scripts/jira-api.sh GET "/rest/api/3/search?jql=…" \
  | python3 -c 'import sys,json;
d=json.load(sys.stdin)
for i in d.get("issues",[]):
    f=i["fields"]; a=(f.get("assignee") or {}).get("displayName","—")
    print(f'"'"'{i["key"]:10} {f["status"]["name"]:14} {a:18} {f["summary"][:60]}'"'"')'
```

## Board 721 backlog (Agile API)

```bash
bash .claude/skills/jira/scripts/jira-api.sh GET \
  "/rest/agile/1.0/board/721/backlog?maxResults=30&fields=summary,status,issuetype,customfield_10001"
```

## Active sprint issues

```bash
bash .claude/skills/jira/scripts/jira-api.sh GET \
  "/rest/agile/1.0/board/721/sprint?state=active" # find sprint id, then:
bash .claude/skills/jira/scripts/jira-api.sh GET \
  "/rest/agile/1.0/sprint/<SPRINT_ID>/issue?fields=summary,status,assignee"
```

## Common Pitfalls

- **Un-encoded JQL** → 400 / partial matches. Always URL-encode.
- **`maxResults` caps at 100** per page; use `startAt` to paginate.
- Field IDs, not names, in `fields=` (e.g. `customfield_10001`, not `Team`).
