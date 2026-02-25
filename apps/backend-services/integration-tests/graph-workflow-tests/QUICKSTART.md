# Quick Start: Graph Workflow Integration Test

## Prerequisites

Start all required services:

### 1. Start Temporal Server and Database
```bash
cd apps/temporal
docker-compose up -d
```

### 2. Start Backend Database
```bash
cd apps/backend-services
docker-compose up -d
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
2. ✓ Loads `docs-md/templates/standard-ocr-workflow.json`
3. ✓ Loads test image from `integration-tests/test-document.jpg`
4. ✓ Creates workflow config in database
5. ✓ Uploads test document
6. ✓ Monitors workflow execution through Temporal
7. ✓ Shows real-time progress of each activity
8. ✓ Cleans up test data when done

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
