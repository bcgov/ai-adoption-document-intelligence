# Playwright Testing Setup

This document describes the Playwright test infrastructure for the AI OCR application.

## Directory Structure

```
.
├── playwright.config.ts              # Playwright configuration (loads .env)
├── scripts/
│   └── create-test-api-key.js       # Script to seed test API key in database
├── tests/
│   └── e2e/
│       ├── README.md                # Detailed testing documentation
│       ├── api-key-auth.spec.ts     # Backend API key authentication tests
│       ├── frontend-with-mock-auth.spec.ts  # Frontend mock auth tests
│       └── training-labels-with-api-key.spec.ts  # Full E2E navigation tests
└── test-results/                    # Generated screenshots (gitignored)
    ├── frontend-app-authenticated.png
    ├── training-labels-with-projects.png
    └── training-labels-project-details.png
```

## File Purposes

### Configuration

- **`playwright.config.ts`**: Main Playwright configuration
  - Loads environment variables from `apps/backend-services/.env`
  - Configures test directory, parallelization, retries
  - Sets up browser projects (currently Chromium)

### Test Files

All tests are in `tests/e2e/`:

1. **`api-key-auth.spec.ts`**: Backend API authentication
   - Tests x-api-key header authentication
   - Validates 401 responses without key
   - Uses Playwright's request context (no browser)

2. **`frontend-with-mock-auth.spec.ts`**: Frontend mock authentication
   - Bypasses SSO by injecting localStorage tokens
   - Verifies app UI renders without Keycloak
   - Takes screenshots for visual verification

3. **`training-labels-with-api-key.spec.ts`**: Full E2E integration
   - Uses route interception to add x-api-key headers
   - Navigates through the app UI
   - Verifies real data from backend displays correctly

### Scripts

- **`scripts/create-test-api-key.js`**: Database seeding utility
  - Creates/updates test API key in database
  - Hashes the key with bcrypt
  - Run with: `npm run setup:test-api-key`

### Documentation

- **`tests/e2e/README.md`**: Comprehensive testing guide
  - Setup instructions
  - Test suite descriptions
  - Troubleshooting tips
  - Environment variables

## NPM Scripts

```json
{
  "test:e2e": "playwright test",                    // Run all tests
  "test:e2e:ui": "playwright test --ui",            // Interactive mode
  "test:api-auth": "playwright test tests/e2e/api-key-auth.spec.ts",
  "test:frontend-mock": "playwright test tests/e2e/frontend-with-mock-auth.spec.ts",
  "test:training-labels": "playwright test tests/e2e/training-labels-with-api-key.spec.ts",
  "setup:test-api-key": "node scripts/create-test-api-key.js"
}
```

## Gitignored Directories

These directories are generated during test runs and should not be committed:

- `test-results/` - Screenshots and test artifacts
- `playwright-report/` - HTML test reports
- `.playwright-mcp/` - Playwright MCP tool cache

## Key Patterns

### Request Interception

Tests use Playwright's route interception to modify requests:

```typescript
await page.route(`${BACKEND_URL}/**`, async (route, request) => {
  const headers = {
    ...request.headers(),
    'x-api-key': TEST_API_KEY!,
  };
  delete headers['authorization'];
  await route.continue({ headers });
});
```

### Mock Authentication

Tests inject fake JWT tokens to bypass SSO:

```typescript
const mockAuthTokens = {
  access_token: 'mock-access-token',
  id_token: createFakeJWT({ name: 'Test User', ... }),
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};
localStorage.setItem('auth_tokens', JSON.stringify(mockAuthTokens));
```

## Best Practices

1. **Always run setup first**: `npm run setup:test-api-key`
2. **Keep tests independent**: Each test should work in isolation
3. **Use screenshots**: Visual proof is valuable for debugging
4. **Test with real data**: Use route interception to test against actual backend
5. **Clean up after tests**: Playwright handles this automatically

## Future Enhancements

Potential improvements to consider:

- [ ] Add test fixtures for common setup/teardown
- [ ] Create helper functions for auth token injection
- [ ] Add visual regression testing with Percy or similar
- [ ] Add more coverage for other pages (Workflows, HITL Review, etc.)
- [ ] Set up CI/CD integration with GitHub Actions
- [ ] Add API contract testing with Pact or similar
