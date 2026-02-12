# Temporal Worker Source Guide (`apps/temporal/src`)

This folder contains the Temporal worker application for document-processing workflows.

Today, the primary runtime path is the **graph-based workflow engine** (`graphWorkflow`), while a legacy fixed-step OCR workflow (`ocrWorkflow`) is still present for replay/testing and backward compatibility in this repo.

---

## What This App Does

At runtime, this app:
- connects a Temporal worker to the configured namespace/task queue,
- registers workflow code and activity functions,
- executes workflow tasks deterministically,
- executes activity tasks for external I/O (DB, blob storage, Azure OCR, etc.),
- enforces graph workflow validation and execution semantics.

In system context:
- backend-services starts workflow executions by name (`graphWorkflow`),
- this worker receives and runs those executions,
- activity implementations in this app perform side effects and return results to workflow code.

---

## High-Level Runtime Flow

1. Backend starts `graphWorkflow` with `graph`, `initialCtx`, `configHash`, and `runnerVersion`.
2. Worker process (`worker.ts`) loads workflow bundle (`graph-workflow.ts`) and activity map (`activity-registry.ts`).
3. `graph-workflow.ts` sets query/signal handlers, validates graph config, runs a pre-execution status update.
4. `graph-engine/runGraphExecution` executes DAG nodes batch-by-batch using ready-set logic.
5. Node executors invoke activities, evaluate expressions, route branches, handle map/join, child workflows, polling, and human gates.
6. Workflow returns final context plus status (`completed`, `failed`, or `cancelled`).

For graph-engine internals, see `graph-engine/README.md`.

---

## Directory Structure

### `activities/`

Concrete Temporal activity implementations (non-deterministic code allowed here).

Contains:
- OCR pipeline activities (`submit-to-azure-ocr`, `poll-ocr-results`, `extract-ocr-results`, `post-ocr-cleanup`, `check-ocr-confidence`, `upsert-ocr-result`)
- document state/data activities (`update-document-status`, `store-document-rejection`)
- graph support activities (`get-workflow-graph-config`, split/classify/validate/combine activities)
- shared DB helper (`database-client.ts`)
- tests (`*.test.ts`) colocated with activity files

Use this folder when adding or changing side-effecting operations invoked by graph `activity`/`pollUntil` nodes.

### `graph-engine/`

Core DAG execution runtime used by `graph-workflow.ts`.

Contains:
- execution loop (`graph-runner.ts`)
- ready-set and DAG algorithms (`graph-algorithms.ts`)
- node-type handlers (`node-executors.ts`)
- context read/write helpers (`context-utils.ts`)
- error handling (`error-handling.ts`)
- shared execution state type (`execution-state.ts`)
- runner utilities (`runner-utils.ts`)
- tests and dedicated engine README

### `blob-storage/`

Blob key to filesystem resolution helpers used by activities reading local blob storage.

- `blob-path-resolver.ts`: resolves blob keys safely against configured base path.
- `blob-path-resolver.test.ts`: path traversal and resolution tests.

### `scripts/`

Utility scripts used for workflow test artifacts.

- `generate-history-fixture.ts`: runs a workflow in Temporal test env and writes replay history to `__fixtures__/`.

### `test/`

Testing-only helpers.

- `mock-activities.ts`: deterministic-ish mock activity implementations for integration/replay fixture flows.

### `utils/`

Small shared helpers.

- `database-url.ts`: DB URL + SSL option helpers for Prisma adapter configuration.

### `__fixtures__/`

Committed fixture inputs for replay tests.

- `ocr-workflow-history.json`: captured workflow event history used by replay determinism tests.

### `generated/`

Generated Prisma client/runtime artifacts used by this app.

Notes:
- includes generated client/runtime JS/TS files and `schema.prisma`,
- this is generated code; do not manually edit,
- regenerate via project-approved generation flow when schema/client changes.

---

## Top-Level Files and Purpose

### Active Graph Workflow Path

- `worker.ts`
  - Worker entrypoint.
  - Builds activity map from `activity-registry.ts`.
  - Registers workflow bundle via `workflowsPath: ./graph-workflow`.

- `graph-workflow.ts`
  - Main graph workflow function (`graphWorkflow`).
  - Defines queries (`getStatus`, `getProgress`) and cancel signal.
  - Validates graph at execution time and invokes graph engine.

- `graph-workflow-types.ts`
  - Canonical type system for graph schema, nodes, edges, expressions, input/output, query payloads.
  - Shared contract with backend/frontend equivalents.

- `graph-schema-validator.ts`
  - Deterministic runtime validator for graph configs.
  - Verifies schema version, node/edge integrity, activity type validity, expressions, reachability, map/join refs, and more.

- `activity-registry.ts`
  - Maps graph `activityType` strings to actual activity functions plus metadata.
  - Source of truth for worker activity registration.

- `activity-types.ts`
  - Workflow-safe list of registered activity type strings (importable by workflow code).

- `expression-evaluator.ts`
  - Evaluates graph condition DSL for `switch` and `pollUntil`.

- `config-hash.ts`
  - Normalizes graph config and computes deterministic SHA-256 hash.
  - Used to detect/track exact graph configuration at workflow start.

### Legacy/Supporting OCR Workflow Path

- `workflow.ts`
  - Legacy step-based OCR workflow (`ocrWorkflow`) with fixed sequence.
  - Still used by replay/fixture tooling and some older tests.

- `workflow-config.ts`
  - Default config and merge helper for legacy step-based workflow options.

- `workflow-config-validator.ts`
  - Validation for legacy step-based workflow config shape and parameter ranges.

- `types.ts`
  - Legacy OCR-specific DTO/type definitions used by `workflow.ts` and many activities/tests.

- `client.ts`
  - Developer-facing helper functions for starting/querying legacy `ocrWorkflow` directly.

- `example.ts`
  - Example script showing how to run legacy `ocrWorkflow`.

### Test and Validation Files

- `graph-workflow.test.ts`
  - Integration-heavy tests for graph workflow behavior.

- `graph-schema-validator.test.ts`
  - Runtime graph validator test suite.

- `expression-evaluator.test.ts`
  - DSL operator and value resolution tests.

- `activity-registry.test.ts`
  - Registry integrity/coverage tests.

- `workflow.replay.test.ts`
  - Determinism guard by replaying recorded workflow history.

---

## How the Pieces Connect

### 1) Worker bootstrap

- `worker.ts` reads environment (`TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`).
- It loads activities from `activity-registry.ts`.
- It points workflows to `graph-workflow.ts` so Temporal can execute `graphWorkflow`.

### 2) Graph workflow orchestration

- `graph-workflow.ts` receives `GraphWorkflowInput`.
- It enforces runner-version compatibility, validates graph config via `graph-schema-validator.ts`, and initializes query/signal handlers.
- It delegates execution to `graph-engine`.

### 3) Engine execution

- Ready nodes are computed by graph algorithms.
- Nodes are executed by node-type handlers.
- Activities are invoked through Temporal proxies, using activity type strings from node definitions.
- State is tracked in `ExecutionState` (completed nodes, node statuses, selected edges, last error, etc.).

### 4) Activity boundary

- Workflow code remains deterministic.
- All external effects happen in `activities/*`.
- Activity signatures and mapping are controlled by `activity-registry.ts` and validated by `activity-types.ts`/`graph-schema-validator.ts`.

---

## Determinism and Safety Rules

This codebase follows Temporal determinism constraints:
- workflow files avoid non-deterministic operations (no direct DB/network/file I/O),
- external operations are pushed into activities,
- replay tests (`workflow.replay.test.ts`) detect unsafe workflow-code changes,
- graph validation in worker is deterministic and defensive.

---

## Development Notes

- When adding a new **activity type**, update:
  - `activities/*` implementation,
  - `activity-registry.ts`,
  - `activity-types.ts`,
  - related tests.

- When adding a new **graph node type**, update:
  - `graph-workflow-types.ts`,
  - `graph-engine/node-executors.ts` (and possibly algorithms),
  - `graph-schema-validator.ts`,
  - tests.

- Keep backend and worker graph contracts aligned (types + validation + activity type strings).

- For engine-level details and node semantics, see `graph-engine/README.md`.

