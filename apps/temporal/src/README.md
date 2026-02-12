# Temporal Worker Source Guide (`apps/temporal/src`)

This folder contains the Temporal worker runtime for graph-based document workflows.

## Core Runtime

- `worker.ts`: worker entrypoint; registers workflow bundle and activities.
- `graph-workflow.ts`: Temporal workflow entrypoint (`graphWorkflow`) with queries/signals and runtime validation.
- `graph-engine/`: DAG interpreter runtime used by `graphWorkflow`.
- `activity-registry.ts`: maps graph `activityType` strings to activity functions.
- `activity-types.ts`: workflow-safe activity type constants.
- `graph-schema-validator.ts`: deterministic runtime graph validation.
- `graph-workflow-types.ts`: graph schema and execution contracts.

For engine internals and node semantics, see `graph-engine/README.md`.

## Folder Map

- `activities/`: side-effecting Temporal activities and tests.
- `blob-storage/`: local blob key/path resolution helpers.
- `utils/`: shared utility helpers.
- `test/`: test helpers (for example, mock activity implementations).
- `generated/`: generated Prisma client/runtime files.

## How It Fits in the System

1. Backend starts workflow type `graphWorkflow` with `graph`, `initialCtx`, `configHash`, `runnerVersion`.
2. Worker receives tasks on configured task queue.
3. `graph-workflow.ts` validates graph and delegates execution to `graph-engine`.
4. Node execution invokes registered activities via `activityType` bindings.
5. Workflow status/progress is exposed through queries; cancellation/human gating through signals.

## Determinism Boundary

- Workflow code (`graph-workflow.ts`, `graph-engine/*`, validators, expression evaluator) must stay deterministic.
- External I/O is isolated to `activities/*`.

## Development Notes

- Add activity type: implement activity -> export from `activities.ts` -> register in `activity-registry.ts` -> add to `activity-types.ts` -> tests/docs.
- Add node type: extend `graph-workflow-types.ts`, `graph-engine`, and `graph-schema-validator.ts` -> tests/docs.

