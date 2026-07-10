# Jira Conventions

Rules that apply to every write to this Jira instance.

## Team is mandatory

- Every new ticket MUST set `customfield_10001` (Team) to
  `16e1d32f-a986-42d4-bda6-55c25f4a765b` ("AI Technical Solutions Team").
  Tickets without a team fall off board 721 and the team's backlog.
- `scripts/create-ticket.sh` sets this automatically — prefer it over a raw
  `POST /rest/api/3/issue`. If you must build the payload by hand, include the
  Team field.

## Project & issue types

- Project key is always `AI`.
- Valid issue types: `Task`, `Story`, `Bug`, `Epic`, `Initiative`, `Sub-task`
  (Sub-task also requires a `parent`).
- Default to `Task` unless the user specifies otherwise.

## Descriptions

- The v3 API requires **ADF** JSON, not a plain string. Passing a string makes
  the create call fail. Let `create-ticket.sh` wrap plain text into ADF.

## Secrets

- The token lives only in `~/.config/jira/credentials.env` (outside the repo).
- Never echo, cat, log, or paste the token. Never commit a credentials file.
- All auth flows through `scripts/jira-api.sh`.

## Test / throwaway tickets

- Prefix summaries of verification tickets with `TEST — ` and note they are
  safe to close, so the team can spot and clean them up.
