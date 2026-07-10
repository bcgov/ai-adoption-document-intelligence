# Workflow: Create a Ticket

Read [../CONVENTIONS.md](../CONVENTIONS.md) first — the Team field is mandatory.

## Steps

1. Confirm the issue type (default `Task`) and gather a clear summary. Ask the
   user for a description if the request is vague; don't invent scope.

2. Create the ticket via the helper (Team field is applied automatically):

   ```bash
   bash .claude/skills/jira/scripts/create-ticket.sh \
     "Fix flaky OCR retry on encrypted PDFs" \
     Bug \
     "Encrypted PDFs are rejected by Azure OCR and the workflow never resets status. Repro: upload an encrypted PDF."
   ```

   Arguments: `"Summary"` (required), `IssueType` (optional, default `Task`),
   `"Description"` (optional plain text — wrapped into ADF for you).

3. The command prints JSON like `{"id":"...","key":"AI-1674", ...}`. Report the
   key back to the user as a link:
   `https://citz-do.atlassian.net/browse/AI-1674`.

4. (Optional) Verify it landed with the right team/type:

   ```bash
   bash .claude/skills/jira/scripts/jira-api.sh GET \
     "/rest/api/3/issue/AI-1674?fields=summary,issuetype,status,reporter,customfield_10001"
   ```

## Setting extra fields (assignee, priority, labels, parent epic)

For anything beyond summary/type/description, build the payload and POST it
directly. Always keep `customfield_10001` in `fields`:

```bash
bash .claude/skills/jira/scripts/jira-api.sh POST /rest/api/3/issue '{
  "fields": {
    "project": {"key": "AI"},
    "issuetype": {"name": "Story"},
    "summary": "…",
    "customfield_10001": "16e1d32f-a986-42d4-bda6-55c25f4a765b",
    "assignee": {"id": "62cc6401c537f460d444ff02"},
    "labels": ["tech-debt"],
    "description": {"type":"doc","version":1,"content":[
      {"type":"paragraph","content":[{"type":"text","text":"…"}]}
    ]}
  }
}'
```

To find an account id for a different assignee:

```bash
bash .claude/skills/jira/scripts/jira-api.sh GET \
  "/rest/api/3/user/search?query=firstname.lastname@gov.bc.ca"
```

## Common Pitfalls

- **Missing Team** → ticket disappears from board 721. Use `create-ticket.sh`
  or include `customfield_10001`.
- **Plain-string description** → 400 error. Descriptions must be ADF on v3.
- **Wrong issue type name** → 400. Names are case-sensitive (`Sub-task`, not
  `Subtask`). Sub-tasks also need a `parent`: `{"key":"AI-123"}`.
