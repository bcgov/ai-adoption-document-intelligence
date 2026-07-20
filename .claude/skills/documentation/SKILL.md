---
name: documentation
description: "Update project documentation and the repo wiki when features or boundaries change. Trigger phrases: update documentation, update docs, update the wiki, document this change, docs and wiki, ingest wiki. Do NOT invoke for: editing only the public HTML docs site pages (use docs-site), or general code changes with no doc impact."
---

# Documentation

Keeps implementation docs, ownership maps, and the repo wiki aligned when code or contributor guidance changes.

## Always Follow

- Read [AGENTS.md](../../../AGENTS.md) documentation ownership and Repo Wiki sections before editing
- Update **canonical** sources first (`docs-md/`, code-adjacent READMEs, root/`apps` READMEs as appropriate)
- Update the wiki only for routing, synthesis, cross-links, or drift notes — never copy full runbooks, schemas, or endpoint lists into `docs-md/wiki/`
- Follow wiki ingest / query / lint workflows in [docs-md/wiki/README.md](../../../docs-md/wiki/README.md)
- Run `npm run docs:wiki:check` after any change under `docs-md/wiki/`
- Do not commit generated `docs/wiki*.html`; build via `docs/build.sh` at deploy time
- For public HTML site pages under `docs/_pages/`, use the [docs-site](../docs-site/SKILL.md) skill

## Ownership (where to edit)

| Layer | Owns |
| --- | --- |
| Root `README.md` | Local setup, prerequisites, development commands |
| `apps/README.md` | App-level boundaries only; link to root README for setup |
| `docs-md/` | Stable implementation and operations docs |
| `docs-md/wiki/` | Routing map for agents and contributors (not a second implementation spec) |
| `docs/` (`_pages/`) | Public overview and links; defer detailed setup to root README |

## Workflows

1. **[Update docs and wiki](Workflows/update-docs-and-wiki.md)** — After a feature or boundary change, update canonical docs and run wiki ingest when needed
