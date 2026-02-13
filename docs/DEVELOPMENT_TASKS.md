# Development Tasks

This project includes a Cursor/VS Code task setup to start local development services in integrated terminal sessions.

## Run all development services

1. Open Command Palette.
2. Run `Tasks: Run Task`.
3. Select `Dev: all`.

This starts the following tasks in parallel, each in a separate terminal panel:

- `temporal: docker up` (`apps/temporal`)
- `temporal: dev` (`apps/temporal`)
- `backend-services: docker up` (`apps/backend-services`)
- `root: frontend dev` (repo root)
- `root: backend dev` (repo root)

The `Dev: all` flow is dependency-aware:

- `Dev: prerequisites` runs in sequence:
  - `temporal: docker up`
  - `wait: temporal ready` (waits for Temporal container health to be `healthy`)
  - `backend-services: docker up`
  - `wait: backend postgres ready` (waits for Postgres container health to be `healthy`)
- `Dev: runtime` starts only after prerequisites complete and then launches:
  - `temporal: dev`
  - `root: frontend dev`
  - `root: backend dev`

## Notes

- The task configuration is stored in `.vscode/tasks.json`.
- Docker commands use `docker compose` syntax.
- `Dev: all` has `runOptions.runOn = "folderOpen"` for automatic startup on workspace open (after task auto-run is allowed).

## Cursor slash command

You can trigger the same workflow through a custom Cursor command:- Run `/dev-up` in Cursor Agent.
- The command definition lives at `.cursor/commands/dev-up.md`.
- It is wired to use the `Dev: all` task so services launch in integrated terminal panels.
