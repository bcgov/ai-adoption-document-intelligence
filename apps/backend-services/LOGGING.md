# Backend Logging for Test Debugging

## Overview

The NestJS backend writes comprehensive logs to `apps/backend-services/backend.log` to help debug Playwright test failures.

## What Gets Logged

### Request/Response Logging
Every HTTP request is logged with:
- Method and URL
- Query parameters
- Request body (truncated to 500 chars)
- Response status code
- Response time in milliseconds
- Response data (truncated to 500 chars)

### Error Logging
All errors include:
- Error message
- HTTP status code
- Stack trace
- Request context

### Application Logging
All application logs from services, controllers, and modules are written to both:
- Console (for real-time monitoring)
- Log file (for test debugging)

## Log Format

```
[2026-02-16T12:34:56.789Z] [LOG] [Bootstrap] Backend services is running on: http://localhost:3002
[2026-02-16T12:34:57.123Z] [LOG] [HTTP] → POST /api/benchmarking/datasets
[2026-02-16T12:34:57.125Z] [DEBUG] [HTTP]   Body: {"name":"Test Dataset","description":"..."}
[2026-02-16T12:34:57.234Z] [LOG] [HTTP] ← POST /api/benchmarking/datasets 201 (111ms)
[2026-02-16T12:34:57.235Z] [DEBUG] [HTTP]   Response: {"id":"123","name":"Test Dataset",...}
[2026-02-16T12:34:58.456Z] [ERROR] [HTTP] ✗ POST /api/benchmarking/runs 400 (5ms)
[2026-02-16T12:34:58.457Z] [ERROR] [HTTP]   Error: Validation failed: datasetId must be a valid UUID
```

## Usage During Test Debugging

### When Playwright Tests Fail

1. **Identify failed API call** from test output
2. **Read backend log**:
   ```bash
   tail -n 50 apps/backend-services/backend.log
   ```
3. **Find the corresponding request** in the log
4. **Locate the error message** and stack trace
5. **Fix the root cause** in backend code

### Common Debugging Scenarios

#### API returns 404
```bash
grep "404" apps/backend-services/backend.log
```
Likely causes: Missing endpoint, wrong route, or middleware blocking request

#### API returns 400 (Validation Error)
```bash
grep -A 5 "400" apps/backend-services/backend.log
```
Look for validation error details in the error message

#### API returns 500 (Internal Server Error)
```bash
grep -A 10 "500" apps/backend-services/backend.log
```
Check stack trace for unhandled exceptions, database errors, or null references

### Clearing Logs

The log file is automatically cleared on backend startup. To manually clear:
```bash
> apps/backend-services/backend.log
```

Or to keep historical logs, comment out the `writeFileSync` line in `file-logger.service.ts`.

## Integration with Test-Fixer Skill

The `/test-fixer` skill automatically:
1. Detects API failures (4xx/5xx status codes)
2. Reads `apps/backend-services/backend.log`
3. Analyzes error messages
4. Fixes backend implementation based on errors

This creates a healing feedback loop where:
- Playwright tests → Fail with API error
- Test-fixer → Reads backend log
- Test-fixer → Identifies root cause
- Test-fixer → Fixes backend code
- Test re-runs → Passes ✅
