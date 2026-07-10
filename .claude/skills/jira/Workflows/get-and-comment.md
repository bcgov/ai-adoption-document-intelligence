# Workflow: Read, Comment, Transition

## Read a ticket

```bash
bash .claude/skills/jira/scripts/jira-api.sh GET \
  "/rest/api/3/issue/AI-1674?fields=summary,description,status,issuetype,assignee,reporter,customfield_10001,comment"
```

## Add a comment (ADF body)

```bash
bash .claude/skills/jira/scripts/jira-api.sh POST /rest/api/3/issue/AI-1674/comment '{
  "body": {"type":"doc","version":1,"content":[
    {"type":"paragraph","content":[{"type":"text","text":"Fixed in commit abc123, ready for review."}]}
  ]}
}'
```

## Transition status (e.g. To Do → In Progress → Done)

Transitions are id-based and workflow-specific. List valid transitions first:

```bash
bash .claude/skills/jira/scripts/jira-api.sh GET \
  "/rest/api/3/issue/AI-1674/transitions" \
  | python3 -c 'import sys,json; [print(t["id"], "->", t["name"]) for t in json.load(sys.stdin)["transitions"]]'
```

Then apply the chosen transition id:

```bash
bash .claude/skills/jira/scripts/jira-api.sh POST \
  /rest/api/3/issue/AI-1674/transitions '{"transition":{"id":"21"}}'
```

A successful transition/comment returns `204 No Content` (empty output) or the
created comment JSON — no error means it worked; re-GET to confirm.

## Assign a ticket

```bash
bash .claude/skills/jira/scripts/jira-api.sh PUT \
  /rest/api/3/issue/AI-1674/assignee '{"accountId":"62cc6401c537f460d444ff02"}'
```

## Common Pitfalls

- **Transition ids differ per project/workflow** — never hardcode; always list
  first.
- **Plain-string comment body** → 400. Comments are ADF, like descriptions.
- Deleting/closing another person's ticket is destructive — confirm with the
  user before transitioning to Done or deleting.
