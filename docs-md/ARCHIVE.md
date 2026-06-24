# Archived and Historical Documentation

These paths are **not canonical** for current behavior. Use them for history, audits, or feature context only. For implementation truth, follow [docs-md/](.) stable docs, code, and [wiki/index.md](wiki/index.md).

## Historical folders

| Path | Purpose | Canonical alternative |
| --- | --- | --- |
| `docs-md/temp/` | Point-in-time security audits | `docs-md/AUTHENTICATION.md`, `apps/backend-services/src/auth/`, `apps/backend-services/src/actor/` |
| `docs/superpowers/` | Pre-implementation plans and specs | Shipped behavior in `docs-md/` and code |
| `feature-docs/` | Requirements, user stories, design for delivered features | Stable docs in `docs-md/`; wiki routes by topic |
| `docs-md/rapid-assessment-2026-04-09/` | Rapid assessment output | Current ops/security docs in `docs-md/` |

## Known stale patterns in historical docs

Do not copy these into new documentation:

- `apps/backend-services/docker-compose.yml` or `apps/temporal/docker-compose.yaml` — use repo-root `docker-compose.yml`
- `deployments/local/docker-compose.monitoring.yml` — use `docker compose --profile monitoring`
- `apps/backend-services/src/api-key/` — use `src/actor/` (management) and `src/auth/api-key-auth.guard.ts` (validation)

## Policy (open question)

When a feature is complete, choose one: promote stable content into `docs-md/`, archive the `feature-docs/` folder with a link here, or mark the folder README as historical only. See [wiki/open-questions.md](wiki/open-questions.md).
