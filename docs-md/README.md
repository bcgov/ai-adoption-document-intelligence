# `docs-md` — developer reference documentation

Markdown reference docs for engineers working on this repo. `CLAUDE.md` says to *"create/update documentation in /docs-md folder"* — this file is the map of where in it things go.

Not to be confused with:

| Location | What it is |
|---|---|
| `docs-md/` | **This.** Developer reference — architecture, subsystems, runbooks. |
| `docs/` | The published HTML documentation site (see the `docs-site` skill). |
| `feature-docs/` | Per-feature working docs, dated `YYYYMMDD-topic/`. Working notes for one piece of work, not durable reference. |
| `docs/superpowers/plans/` | Implementation plans, dated `YYYY-MM-DD-topic.md`. |

## Where a new document goes

**Topic folders** — use one when the subject already has a folder:

| Folder | Scope |
|---|---|
| `workflow-builder/` | The visual workflow designer: canvas, typed I/O, auto-wire, try-in-place, dynamic nodes, the AI agent. Includes `MANUAL_TEST_PLAN.md`. |
| `graph-workflows/` | The graph workflow engine and its shipped `templates/`. |
| `group/` | Group/tenant model, membership, resource authorization. |
| `temporal/` | Temporal workers, queues, workflow execution concerns. |
| `openshift-deployment/` | Cluster deployment, instances, environments. |
| `testing/` | Cross-cutting testing guidance. |
| `rapid-assessment-2026-04-09/` | Point-in-time assessment. Historical — do not extend. |
| `temp/` | Scratch. Nothing here is durable; do not link to it from elsewhere. |

**Root level** — a single-subject document with no folder lives at the root in `SCREAMING_SNAKE_CASE.md` (`AUDIT.md`, `HITL_ARCHITECTURE.md`, `DATABASE_SERVICES.md`, …). Lowercase-kebab names at the root are older or narrower notes (`hitl-dataset-creation.md`, `prod-secrets-rotation.md`); prefer the uppercase form for new architectural docs.

**Create a folder** when a subject accumulates three or more documents.

## Conventions

- One subject per file. If a doc needs a "Part 2", it probably needs a folder.
- Cite code as `path/to/file.ts:123` and keep citations current — several docs in this repo have drifted, and a stale line number is worse than none.
- Record *why*, not just *what*. The decisions that survive are the ones with their reasoning attached.
- When behaviour changes, update the doc in the same commit. `CLAUDE.md` requires it.
- Deliberate non-decisions are worth writing down — a recorded "we are not supporting this, because…" stops the same question being rediscovered.

## Known drift

- Some documents reference an `architecture/` subfolder. **It does not exist** — `DATABASE_SERVICES.md`, `AUDIT.md` and friends live at the root. Fix the link, not the layout.

## Notable entry points

| Document | Why you'd read it |
|---|---|
| `workflow-builder/MANUAL_TEST_PLAN.md` | The walkthrough script for the visual builder. |
| `workflow-builder/WORKFLOW_BUILDER_GUIDE.md` | How the builder is put together. |
| `DATABASE_SERVICES.md` | Db-service pattern and the transaction rules. |
| `AUDIT.md` | Audit-event obligations for every mutation. |
| `TESTING.md` | How to run the suites, including `@infra` and `@llm` tiers. |
| `HITL_ARCHITECTURE.md` | Human-in-the-loop review sessions and status transitions. |
| `OCR_FAILURE_HANDLING.md` | Document status lifecycle and why a document never strands in "Processing". |
