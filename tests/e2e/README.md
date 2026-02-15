# E2E Tests

This directory contains end-to-end tests for the AI OCR application using Playwright.

**📖 [How to Write New Tests](./WRITING_TESTS.md)** - Start here to create new tests!

## 🤖 Automated Testing Workflow

We have a complete automated workflow for generating, running, and healing tests using Claude Code skills:

### Available Skills

1. **`/test-planner`** - Converts feature requirements into structured test plans
2. **`/playwright-explorer`** - Explores the app with Playwright and documents pages
3. **`/test-generator`** - Generates test code from plans and exploration data
4. **`/test-healer`** - Runs tests and automatically fixes failures

### Quick Workflow

```bash
# 1. Generate test plans from requirements
/test-planner feature-docs/003-benchmarking-system/

# 2. Explore the application (requires app running)
/playwright-explorer feature-docs/003-benchmarking-system/

# 3. Generate test code
/test-generator feature-docs/003-benchmarking-system/

# 4. Run and auto-heal tests
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```

**Key Principle**: Tests are generated from `requirements.md` and `user-stories/`, not from application behavior. If the app doesn't match requirements, tests will flag the discrepancy.

See [`.claude/skills/config/playwright-workflow.md`](../../.claude/skills/config/playwright-workflow.md) for detailed workflow documentation.

## Setup

1. Ensure the backend and frontend are running:
   ```bash
   npm run dev
   ```

2. Create the test API key in the database:
   ```bash
   npm run setup:test-api-key
   ```

   This creates a test API key that matches the `TEST_API_KEY` value in `apps/backend-services/.env`.

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run API authentication tests only
```bash
npm run test:api-auth
```

### Run frontend mock authentication tests
```bash
npm run test:frontend-mock
```

### Run Training Labels navigation tests
```bash
npm run test:training-labels
```

### Run tests in UI mode (interactive)
```bash
npm run test:e2e:ui
```

### View test screenshots
Screenshots are saved to the `test-results/` directory:
- `frontend-app-authenticated.png` - App with mocked auth
- `frontend-app-with-api-access.png` - App with API key access
- `training-labels-with-projects.png` - Training Labels page showing projects
- `training-labels-project-details.png` - Project details page

## Test Suites

### API Key Authentication (`api-key-auth.spec.ts`)

Tests the API key authentication system:
- ✅ Successful authentication with valid API key
- ✅ Rejection of requests without API key
- ✅ Rejection of requests with invalid API key
- ✅ Authentication on different endpoints (labeling, upload)

**How it works:**
- Uses the `x-api-key` header for authentication
- Test API key is stored in `apps/backend-services/.env` as `TEST_API_KEY`
- API keys are hashed with bcrypt in the database for security

### Frontend with Mock Authentication (`frontend-with-mock-auth.spec.ts`)

Tests the frontend app with mocked authentication (bypassing SSO):
- ✅ Renders the full app UI instead of the login screen
- ✅ Displays mocked user information (Test User, test@example.com)
- ✅ Shows all navigation items and app features
- ✅ Can make API calls with the test API key
- ✅ Takes screenshots proving the app is rendered

**How it works:**
- Injects fake JWT tokens into localStorage
- Creates a mock user profile that the frontend displays
- Frontend renders the app without requiring actual Keycloak SSO
- Screenshots saved to `test-results/` directory

### Training Labels with API Key (`training-labels-with-api-key.spec.ts`)

Tests navigating to Training Labels and verifying project data with API key auth:
- ✅ Displays the "SDPR monthly report template" project
- ✅ Navigates to project details page
- ✅ Intercepts frontend requests and adds x-api-key header
- ✅ Backend responds with actual project data

**How it works:**
- Uses Playwright's route interception to modify all backend requests
- Adds `x-api-key` header to every request to the backend
- Removes the `Authorization` Bearer token (since we're using API key)
- Injects mock auth tokens in localStorage for the frontend
- Frontend displays real data fetched from the backend using API key auth

## Configuration

The Playwright configuration is in `playwright.config.ts` at the root of the monorepo.

Environment variables are loaded from `apps/backend-services/.env`:
- `BACKEND_URL` - Backend API URL (default: http://localhost:3002)
- `FRONTEND_URL` - Frontend URL (default: http://localhost:3000)
- `TEST_API_KEY` - API key for testing (must exist in database)

## Troubleshooting

### API key authentication fails (401 Unauthorized)

Make sure the test API key exists in the database:
```bash
npm run setup:test-api-key
```

### Database connection errors

Check that:
1. PostgreSQL is running
2. `DATABASE_URL` in `apps/backend-services/.env` is correct
3. Database migrations have been run

### Tests timeout

Ensure both backend and frontend are running and accessible at the configured URLs.
