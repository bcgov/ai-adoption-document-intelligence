# Graph Workflow Integration Test

This integration test validates the complete execution of graph-based workflows through the entire stack: Backend API → Temporal Server → Temporal Worker → Activities → Database.

## Overview

The test performs the following steps:

1. **Pre-flight Checks**: Verifies that all required services are running
2. **Setup**: Creates a workflow configuration and uploads a test document
3. **Execution**: Monitors the workflow execution through Temporal
4. **Validation**: Observes workflow progress and completion status
5. **Cleanup**: Removes test data

## Prerequisites

### Required Services

All of the following services must be running:

1. **PostgreSQL (Backend Database)**
   ```bash
   cd apps/backend-services
   docker-compose up -d
   ```

2. **Temporal Server & PostgreSQL (Temporal Database)**
   ```bash
   cd apps/temporal
   docker-compose up -d
   ```

3. **Temporal Worker**
   ```bash
   cd apps/temporal
   npm run dev
   ```

4. **Backend Services**
   ```bash
   cd apps/backend-services
   npm run start:dev
   ```

### Environment Variables

The test uses the following environment variables (with defaults):

- `BACKEND_URL` (default: `http://localhost:3001`)
- `TEMPORAL_ADDRESS` (default: `localhost:7233`)
- `TEMPORAL_NAMESPACE` (default: `default`)
- `TEST_TIMEOUT` (default: `300000` ms / 5 minutes)

These are typically already configured in your `.env` file.

## Running the Test

### Option 1: Using the Helper Script (Recommended)

The helper script checks if services are running and provides guidance:

```bash
cd apps/backend-services
./integration-tests/run-workflow-test.sh
```

### Option 2: Using npm Script

```bash
cd apps/backend-services
npm run test:int:workflow
```

### Option 3: Direct Execution

```bash
cd apps/backend-services
ts-node -r tsconfig-paths/register integration-tests/test-graph-workflow.ts
```

## Test Flow

```
1. Pre-flight Checks
   ├─ Check Temporal Server connectivity (port 7233)
   └─ Check Backend API health endpoint

2. Test Setup
   ├─ Load workflow config from docs/templates/standard-ocr-workflow.json
   ├─ Load test file (test-document.jpg)
   ├─ Create workflow configuration in database
   └─ Upload document via /api/upload

3. Workflow Execution
   ├─ Initialize Temporal client
   ├─ Monitor workflow execution
   ├─ Query workflow progress every 2 seconds
   ├─ Log activity completions
   └─ Wait for completion or failure

4. Cleanup
   ├─ Close Temporal connection
   ├─ Delete test document
   └─ Delete test workflow configuration
```

## Expected Output

When running successfully, you'll see output like:

```
================================================================================
  🔍 Integration Test: Graph Workflow Execution
================================================================================

================================================================================
  Pre-flight Checks
================================================================================

ℹ [timestamp] Checking Temporal Server connectivity...
✓ [timestamp] Temporal Server connected at localhost:7233
ℹ [timestamp] Checking Backend API health...
✓ [timestamp] Backend API healthy at http://localhost:3001
✓ [timestamp] All pre-flight checks passed

================================================================================
  Test Setup
================================================================================

ℹ [timestamp] Loading workflow configuration from template...
✓ [timestamp] Loaded workflow config: Standard OCR Workflow
ℹ [timestamp] Loading test document...
✓ [timestamp] Test file loaded: 1136.79 KB
ℹ [timestamp] Creating workflow configuration in database...
✓ [timestamp] Workflow config created with ID: wf-xxx-xxx
ℹ [timestamp] Uploading test document...
✓ [timestamp] Document uploaded with ID: doc-xxx-xxx
ℹ [timestamp] Workflow execution ID: graph-doc-xxx-xxx

================================================================================
  Workflow Execution
================================================================================

ℹ [timestamp] Monitoring workflow: graph-doc-xxx-xxx
ℹ [timestamp] Waiting for workflow to start...
ℹ [timestamp]   ⏳ Step: updateStatus (running)
✓ [timestamp]   ✓ Step completed: updateStatus
ℹ [timestamp]   ⏳ Step: prepareFileData (running)
...
```

## Troubleshooting

### "Failed to connect to Temporal"

- Ensure Temporal Server is running: `cd apps/temporal && docker-compose ps`
- Check if port 7233 is accessible: `curl -v localhost:7233`

### "Backend API not reachable"

- Ensure backend is running: `cd apps/backend-services && npm run start:dev`
- Check health endpoint: `curl http://localhost:3001/health`

### "Workflow template not found"

- Verify the template exists: `ls docs/templates/standard-ocr-workflow.json`

### "Test file not found"

- Verify the test file exists: `ls apps/backend-services/integration-tests/test-document.jpg`

## Test Data

- **Workflow Template**: `docs/templates/standard-ocr-workflow.json`
- **Test Document**: `apps/backend-services/integration-tests/test-document.jpg`

## Cleanup

The test automatically cleans up:
- Test document from database
- Test workflow configuration
- Temporal connections

If the test crashes, you may need to manually clean up:

```bash
# Connect to database and remove test documents
psql -d ai_doc_intelligence -c "DELETE FROM documents WHERE metadata->>'test' = 'true';"
```

## Current Known Issue

The test currently fails at the `azureOcr.submit` activity with:

```
TypeError: Cannot read properties of undefined (reading 'fileName')
```

This is the expected behavior for debugging purposes. The test is designed to help identify and fix data mapping issues between workflow activities.
