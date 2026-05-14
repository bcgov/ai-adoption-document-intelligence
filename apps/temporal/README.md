# Temporal Graph Workflow Worker

Temporal worker application for executing graph-defined document workflows.

## What Runs Here

- Workflow type: `graphWorkflow` (`src/graph-workflow.ts`)
- DAG execution engine: `src/graph-engine/*`
- Activities: `src/activities/*` (registered through `src/activity-registry.ts`)

Backend starts executions through:
- `apps/backend-services/src/temporal/temporal-client.service.ts`

## Setup

```bash
npm install
npm run db:generate
npm run build
```

Start worker:

```bash
npm run dev
```

or

```bash
npm start
```

## Common Scripts

- `npm run build`
- `npm run dev`
- `npm run start`
- `npm run test`
- `npm run type-check`

## Testing Scope

- Graph workflow integration: `src/graph-workflow.test.ts`
- Graph engine unit tests: `src/graph-engine/*.test.ts`
- Validator/expression tests
- Activity tests: `src/activities/*.test.ts`

## Static Assets

### `osd.traineddata`

This file is Tesseract's **Orientation and Script Detection** trained model, required by the `document.normalizeOrientation` activity. It must be present in `apps/temporal/` at runtime.

Without it, `createWorker("osd", OEM.TESSERACT_ONLY)` will fail when the activity attempts to detect page rotation. Tesseract.js can download language data at runtime, but committing this file avoids network dependency in containers and local dev.

**Do not delete this file.**


