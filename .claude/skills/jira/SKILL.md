---
name: jira
description: "Interact with the team's Jira Cloud (citz-do.atlassian.net, project AI / board 721 'AI Technical Solutions Team'). Create, search, read, comment on, and transition tickets. Trigger phrases: create a jira ticket, file a jira issue, log a bug in jira, search jira, find my jira tickets, comment on AI-123, move ticket to in progress, what's in the backlog. Do NOT invoke for: GitHub issues/PRs, local task tracking, or anything unrelated to Atlassian Jira."
---

# Jira Integration

Authenticated access to the CITZ Jira Cloud instance. All requests go through
`scripts/jira-api.sh`, which reads the API token from a file **outside this
repo** (`~/.config/jira/credentials.env`, `chmod 600`) and feeds it to curl via
stdin — the token never appears in argv, logs, or chat output.

## Instance constants

| Thing | Value |
|-------|-------|
| Base URL | `https://citz-do.atlassian.net` |
| Project key | `AI` (name: "TRIP", classic/company-managed) |
| Board | `721` — scrum, "AI Technical Solutions Team" |
| Team field | `customfield_10001` = `16e1d32f-a986-42d4-bda6-55c25f4a765b` ("AI Technical Solutions Team") |
| Owner account | `62cc6401c537f460d444ff02` (alex.struk@gov.bc.ca) |
| REST version | `/rest/api/3` (Jira Platform), `/rest/agile/1.0` (boards/backlog) |

## Workflows

| Task | File |
|------|------|
| Create a ticket (Task/Story/Bug/Epic) | [Workflows/create-ticket.md](Workflows/create-ticket.md) |
| Search / list tickets (JQL, backlog) | [Workflows/search-tickets.md](Workflows/search-tickets.md) |
| Read a ticket, comment, or transition | [Workflows/get-and-comment.md](Workflows/get-and-comment.md) |

## Always follow

- **Read [CONVENTIONS.md](CONVENTIONS.md) before any write operation** (create,
  comment, transition). Every new ticket MUST carry the Team field.
- **Never print, echo, cat, or interpolate the API token.** Only invoke it
  indirectly through `scripts/jira-api.sh`. If the credentials file is missing,
  tell the user how to recreate it — do not ask them to paste the token into chat.
- Descriptions use **ADF** (Atlassian Document Format) on the v3 API, not plain
  strings. `create-ticket.sh` builds the ADF wrapper for you.
- Reference tickets in chat as clickable links: `https://citz-do.atlassian.net/browse/AI-####`.
