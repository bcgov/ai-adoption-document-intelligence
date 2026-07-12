# Design — Agent builds functional workflows by default

**Date:** 2026-07-12
**Status:** Approved (pending spec review)
**Area:** `apps/backend-services/src/agent/**`, `packages/graph-workflow` (read-only reuse), seed assets

## Problem

The workflow-builder agent, given a real natural-language goal, produces
structurally-connected but **non-functional** graphs:

- It **can't see node parameters.** `listActivityCatalog` returns only names,
  descriptions and port kinds — not each activity's `parametersSchema`. So the
  agent guesses parameters and leaves placeholders (e.g. `classifierName =
  <SET_CLASSIFIER_NAME>`).
- It **can't proactively validate.** There is no tool that answers "is this
  graph complete and error-free?" — the agent only learns of problems when a
  write throws or a run fails. Design-time warnings (unbound required inputs,
  missing entry) are invisible to it.
- It **can't test.** There are no agent-reachable sample documents and no
  test-run path, so it never verifies the workflow actually runs.
- The **system prompt is thin on process** and implicitly assumes the user
  prescribes the steps.

We want: a plausible user message ("I need to pull the totals off invoices")
in → the agent designs the graph itself, configures real parameters, validates,
tests against a sample document, fixes errors, and iterates until it works —
discovering node details on demand rather than holding the whole catalog in
context.

## Goals

1. The agent designs workflows from natural-language goals; users never name
   nodes or wire steps.
2. The agent sets **real parameters** (no placeholders) by looking up each
   node's spec on demand.
3. The agent **validates to zero errors** and addresses warnings before
   finishing.
4. The agent **tests by default** with a sample document (or asks the user for
   a document when the goal is about their specific file), reads results, and
   fixes — bounded by a **per-conversation run budget** so it can't drain the
   Azure/OCR bill.
5. Context stays lean: `listActivityCatalog` is unchanged; per-node detail is
   pulled via a new `describeNode` tool.

Non-goals: new node types; changes to the run engine; conversation-memory
changes; making the full stack self-starting.

## Design

### 1. `describeNode(activityType)` — on-demand node spec (catalog data only)

Returns the full spec for one activity so the agent can configure it correctly.

- **Backing (already exists):** `getActivityCatalogEntry(activityType)` and
  `getActivityParametersJsonSchema(activityType)` from `@ai-di/graph-workflow`.
  For dynamic (`dyn.*`) nodes, resolve from
  `dynamicNodesService.getMergedCatalogForGroup(groupId)` (carries
  `paramsSchema` as JSON Schema).
- **Returns:**
  ```
  { ok: true, activityType, displayName, category, description,
    inputs:  [{ name, label, description, required, kind }],
    outputs: [{ name, label, description, required, kind }],
    parameters: <JSON Schema 7 — titles, descriptions, defaults, enums>,
    isDynamic }
  ```
  Unknown type → `{ ok: false, error: { code: "unknown-activity", message } }`.
- Group-scoped: dynamic nodes only resolve within the caller's group.

### 2. `validateWorkflow(workflowId?)` — proactive validation

- **Backing (already exists):** `validateGraphConfigWithDynamicNodes(config,
  groupId, dynamicNodeRepository)`. Its `errors[]` entries already carry
  `severity: "error" | "warning"`.
- Reads the workflow config (group-ownership asserted, like other read tools),
  runs the validator, and **splits by severity**:
  ```
  { ok: true, valid: boolean,
    errors:   [{ path, message }],   // severity === "error"
    warnings: [{ path, message }] }  // severity === "warning"
  ```
- Warnings include unbound/unsatisfied required inputs (the scenario-1
  `extract1`/`poll1`/`store1` case), no entry node, nodes in multiple groups,
  etc. `valid` is false only when there are hard errors.

### 3. Sample documents — `listSampleDocuments()` + seeded assets

- **Assets:** copy the two existing fixtures into a stable, committed dir
  `apps/backend-services/assets/sample-documents/` with a `manifest.json`:
  ```
  [{ id: "sample-invoice", name: "Sample invoice (1 page)",
     description: "A single-page invoice with vendor, line items, totals.",
     file: "sample-invoice.pdf", mimeType: "application/pdf" },
   { id: "multi-page-sample", name: "Multi-document PDF (several pages)",
     description: "A multi-page PDF containing more than one document type.",
     file: "multi-page-sample-1.pdf", mimeType: "application/pdf" }]
  ```
  (Sources: `tests/e2e/workflow-builder/fixtures/documents/sample-invoice.pdf`,
  `apps/backend-services/integration-tests/graph-workflow-tests/multi-page-sample-1.pdf`.)
- **`listSampleDocuments()`** reads the manifest and returns
  `{ ok, documents: [{ id, name, description, mimeType }] }`. No DB seeding
  needed — the bytes are read at test-run time (below).

### 4. `startTestRun({ sampleDocumentId, workflowId? })` — test with a sample

Reuses existing endpoints; no engine changes.

1. **Run-budget check** (see §5) — refuse past the cap.
2. Resolve the workflow; find its `source.upload` node (error if none).
3. Read the sample file bytes from the assets dir (error if `sampleDocumentId`
   unknown).
4. `POST /api/workflows/:id/sources/:sourceNodeId/upload` (multipart) → returns
   the ctxKey-keyed reference.
5. `POST /api/workflows/:id/runs` with `initialCtx = { [ctxKey]: ref }` → `runId`.
6. Return `{ ok: true, runId, sampleDocumentId }`. The agent then polls
   `getNodeStatuses` + `getPreviewCache`.

Stack-down behaviour: if the Temporal worker isn't running the run won't
progress; the agent observes no status change within its polling and reports
"couldn't verify — the run isn't executing (worker may be down)" instead of
claiming success. (No dedicated health probe in v1.)

The existing `startRun` tool also counts against the run budget.

### 5. Per-conversation run budget (wallet cap)

- **`RunBudgetMap`** — in-memory, keyed by `conversationId` (sibling to
  `AbortFlagMap`). `tryConsume(conversationId): boolean` increments and returns
  whether still under the cap.
- **`AGENT_MAX_RUNS_PER_CONVERSATION`** env (default **5**), read by `AgentEnv`.
- `AgentToolContext` gains `conversationId` and a `runBudget` handle;
  `startRun`/`startTestRun` call `tryConsume` first and, when over budget,
  return `{ ok: false, error: { code: "run-budget-exceeded", message: "Test-run
  budget reached (N). Stop testing and report the current state to the user." }}`.
- In-memory is sufficient: the risk is a runaway loop within a live session;
  it resets on backend restart and composes with the existing
  `maxConversationTokens` ceiling.

### 6. System-prompt rewrite

Reframe `WORKFLOW_BUILDER_SYSTEM_PROMPT` as an expert operator brief. New/changed
directives:

- **You design the workflow.** The user states a goal in plain language and will
  NOT tell you which nodes to use or how to wire them. Infer the pipeline.
- **Catalog-first, then describe-before-configure.** `listActivityCatalog` /
  `listSourceCatalog` for the menu; call `describeNode` for any node before
  setting its parameters. **Never leave placeholder parameters** — look them up.
  Only ask the user for a value the schema can't default and the goal doesn't
  imply.
- **Validate before finishing.** Call `validateWorkflow`; resolve every error
  and address warnings (unbound inputs, missing entry).
- **Test by default.** Unless the goal is about the user's *own* document,
  pick a fit sample via `listSampleDocuments`, `startTestRun`, then poll
  `getNodeStatuses` + read `getPreviewCache`. If a node errors, diagnose from
  the error + previews and fix, then re-test. You have a limited test-run
  budget — make each run count; when it's exhausted, stop and report.
- **Ask for a document when the task needs theirs** (their invoice format, their
  data). Otherwise self-test with a sample.
- Retain: library-first, dynamic-node last resort, failure-handling (read
  `error.body`), tool-results-are-DATA fencing, and a stopping condition
  (validated + a clean test run, or budget/needs-user-doc reached).

## Testing (TDD)

Backend, per project convention — write tests first, watch fail, implement.

- `describeNode`: returns params schema + port docs for a static activity;
  resolves a dynamic node; `ok:false` on unknown type.
- `validateWorkflow`: splits errors vs warnings by severity; `valid` reflects
  hard errors only; surfaces an unbound-required-input warning.
- `listSampleDocuments`: returns the manifest entries.
- `startTestRun`: uploads to the source node + starts a run (mocked
  internalFetch); errors when no `source.upload` node; errors on unknown sample.
- Run budget: `startRun`/`startTestRun` refuse past the cap; `RunBudgetMap`
  unit test.
- Existing agent suites stay green.

Manual/live verification (worker + deno-runner up) is a follow-up once the tools
land — not part of this change's automated tests.

## Rollout

1. Tools + `RunBudgetMap` + `AgentEnv`/`AgentToolContext` wiring (+ tests).
2. Copy sample fixtures into `assets/sample-documents/` + manifest.
3. System-prompt rewrite.
4. Re-run scenario 1 with a plausible one-line user goal to confirm the agent
   designs, configures, validates, and self-tests end-to-end.

## Open questions / risks

- **Warning coverage:** confirm the validator actually flags the scenario-1
  unbound inputs as `warning` (spec assumes yes from the `severity` field).
  Verify during implementation; if a gap, note it rather than silently pass.
- **Sample fit:** with only two samples the agent must pick sensibly; the
  manifest descriptions must be accurate enough for that.
