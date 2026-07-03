# Quick Start: Graph Workflow Integration Test

## Prerequisites

Start all required services:

### 1. Start Temporal Server and Database
```bash
docker compose --profile temporal up -d
```

### 2. Start Backend Database
```bash
docker compose --profile infra up -d
```

### 3. Start Temporal Worker
```bash
cd apps/temporal
npm run dev
```

### 4. Start Backend Services
```bash
cd apps/backend-services
npm run start:dev
```

## Run the Test

### Option 1: Using the helper script (checks services first)
```bash
cd apps/backend-services
./integration-tests/run-workflow-test.sh
```

### Option 2: Direct npm script
```bash
cd apps/backend-services
npm run test:int:workflow
```

## What the Test Does

1. ✓ Checks that Temporal (port 7233) and Backend (port 3002) are running
2. ✓ Resolves a workflow by `workflow_slug` and uses its `workflowVersionId`
3. ✓ Loads test image from `integration-tests/test-document.jpg`
4. ✓ Uploads test document (which triggers versionId-only Temporal start)
6. ✓ Monitors workflow execution through Temporal
7. ✓ Shows real-time progress of each activity
8. ✓ Cleans up test data when done

## Troubleshooting

### Document status `failed` immediately (no Temporal workflow)

Upload returns before background OCR runs. If the document moves to `failed` without a `workflow_execution_id`, OCR never reached Temporal.

**Common cause:** API key `group_id` contains characters invalid for blob paths (e.g. `seed-default-group`). OCR reads blobs via `validateBlobFilePath`, which requires group ids matching `/^[a-z][0-9a-z]+$/`.

**Fix:** Re-seed and point the API key at the seeded group:

```bash
cd apps/backend-services
npm run db:seed
# Then update api_keys.group_id to seeddefaultgroup for your test key
```

### `workflow not found` in Temporal

Ensure the Temporal worker is running (`cd apps/temporal && npm run dev`) and listening on task queue `ocr-processing` (default). The test now polls the document API for `workflow_execution_id` before monitoring Temporal.

## Expected Behavior

The test will run and **should currently fail** at the `azureOcr.submit` activity with:

```
TypeError: Cannot read properties of undefined (reading 'fileName')
```

This is the expected behavior - it helps identify the data mapping issue that needs to be fixed.

## Example Output

```
================================================================================
  🔍 Integration Test: Graph Workflow Execution
================================================================================

================================================================================
  Pre-flight Checks
================================================================================

✓ Temporal Server connected at localhost:7233
✓ Backend API healthy at http://localhost:3002
✓ All pre-flight checks passed

================================================================================
  Test Setup
================================================================================

✓ Loaded workflow config: Standard OCR Workflow
✓ Test file loaded: 1136.79 KB
✓ Workflow config created with ID: abc-123
✓ Document uploaded with ID: doc-456
ℹ Workflow execution ID: graph-doc-456

================================================================================
  Workflow Execution
================================================================================

ℹ Monitoring workflow: graph-doc-456
  ⏳ Step: updateStatus (running)
  ✓ Step completed: updateStatus
  ⏳ Step: prepareFileData (running)
  ✓ Step completed: prepareFileData
  ⏳ Step: submitOcr (running)
  ✗ Workflow failed after 3.2s
  ℹ Check Temporal worker logs for detailed error information
```

## Troubleshooting

If services aren't running, the test will tell you exactly what to start.

For more details, see [WORKFLOW_TEST_README.md](./WORKFLOW_TEST_README.md)
