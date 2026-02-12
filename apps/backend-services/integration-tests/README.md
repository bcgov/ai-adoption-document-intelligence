# Integration Tests

This folder contains integration tests for the NestJs backend service.

These tests are designed to test the API and the database together.

They can be run with the command `npm run test:int`, which starts the `run.sh` script.

For this series of tests, an ephemeral database is created. It is then destroyed after testing.
You may need to seed this database for your tests. That can be done within a test file.

Authentication is mocked for these tests, as accessing the BCGOV SSO is not feasible. Use the `TestAppModule` class instead of the standard app module.

Examples can be found in the file `sample-test.spec.ts`.

---

## Graph Workflow Integration Test

The graph workflow integration test validates end-to-end workflow execution with real backend services, Temporal, and database.

### Prerequisites

Before running the integration tests, ensure the following services are running:

1. **Temporal Server**: `cd apps/temporal && docker-compose up -d`
2. **Backend Database**: `cd apps/backend-services && docker-compose up -d`
3. **Backend API**: `cd apps/backend-services && npm run start:dev`
4. **Temporal Worker**: See options below

### Running the Test

#### Option 1: Test Manages Worker (Recommended)

The test will automatically start the worker, capture its logs, and stop it when complete:

```bash
cd ~/GitHub/ai-adoption-document-intelligence/apps/backend-services

# Run with default template and test file
MANAGE_WORKER=true npm run test:int:workflow

# Or use the shorthand script
npm run test:int:workflow:with-worker

# Run with specific template and test file
WORKFLOW_TEMPLATE=multi-page-report-workflow TEST_FILE=multi-page-sample-1.pdf npm run test:int:workflow:with-worker
```

**Benefits:**
- Worker logs appear inline with test output (prefixed with `[WORKER]`)
- Automatic worker cleanup on test completion or failure
- No need to manually start/stop the worker
- Ctrl+C gracefully stops both test and worker

#### Option 2: Manually Managed Worker

Run the worker separately and the test will connect to it:

```bash
# Terminal 1: Start the worker
cd ~/GitHub/ai-adoption-document-intelligence/apps/temporal
npm run dev

# Terminal 2: Run the test
cd ~/GitHub/ai-adoption-document-intelligence/apps/backend-services
WORKFLOW_TEMPLATE=multi-page-report-workflow TEST_FILE=multi-page-sample-1.pdf npm run test:int:workflow
```

**Benefits:**
- Worker stays running between test runs (faster iteration)
- Can inspect worker state between tests
- Useful for debugging worker-specific issues

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MANAGE_WORKER` | `false` | Set to `true` to have the test start/stop the worker |
| `WORKER_STARTUP_DELAY` | `5000` | Milliseconds to wait for worker to initialize (when `MANAGE_WORKER=true`) |
| `WORKFLOW_TEMPLATE` | `standard-ocr-workflow` | Workflow template to test (from `docs/templates/`) |
| `TEST_FILE` | `test-document.jpg` | Test file to upload (from `integration-tests/`) |
| `BACKEND_URL` | `http://localhost:3002` | Backend API URL |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEST_API_KEY` | *(required)* | API key for backend authentication (set in `.env`) |
| `TEST_TIMEOUT` | `300000` | Test timeout in milliseconds (5 minutes) |

### Output Format

When `MANAGE_WORKER=true`, the test output includes:

- **Test logs**: Colored with symbols (✓, ✗, ℹ, ⚠) and timestamps
- **Worker logs**: Prefixed with `[WORKER]` in gray color
- **Activity logs**: JSON logs from activities (e.g., `{"activity":"checkOcrConfidence",...}`)
- **Error details**: Stack traces and workflow history on failure

Example output:
```
ℹ [2026-02-09T03:06:34.959Z] Starting Temporal worker process...
✓ [2026-02-09T03:06:35.959Z] Worker process started (PID: 12345)
[WORKER] {"activity":"checkOcrConfidence","event":"start","documentId":"..."}
[WORKER] {"activity":"checkOcrConfidence","event":"complete","averageConfidence":0.94}
✓ [2026-02-09T03:06:36.959Z] Workflow completed successfully in 2.0s
```

### Troubleshooting

#### Worker doesn't start
- Ensure `npm` is in your PATH
- Check that `apps/temporal/package.json` has a `dev` script
- Increase `WORKER_STARTUP_DELAY` if the worker needs more time to initialize

#### Test times out
- Check that all prerequisite services are running
- Increase `TEST_TIMEOUT` for complex workflows
- Review worker logs for stuck activities

#### Worker logs not appearing
- Ensure `MANAGE_WORKER=true` is set
- Check that the worker is outputting to stdout/stderr
- Verify that worker's console.log/console.error statements are being executed

### Examples

```bash
# Test with managed worker and custom template
MANAGE_WORKER=true WORKFLOW_TEMPLATE=multi-page-report-workflow TEST_FILE=multi-page-sample-1.pdf npm run test:int:workflow

# Test with longer timeout for complex workflows
MANAGE_WORKER=true TEST_TIMEOUT=600000 npm run test:int:workflow

# Test with separate worker (default behavior)
npm run test:int:workflow
```
