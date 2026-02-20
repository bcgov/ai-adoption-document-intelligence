# Test Mode Authentication

## Overview

The backend API key authentication guard supports a special **test mode** that allows Playwright (and other E2E tests) to authenticate with API keys on ALL endpoints, even those without the `@ApiKeyAuth()` decorator.

## How It Works

### Production Mode (Default)
- Only endpoints decorated with `@ApiKeyAuth()` will accept and validate API keys
- Other endpoints ignore API key headers and use their own auth mechanisms (or are public)

### Test Mode (`NODE_ENV=test`)
- **All endpoints** will attempt to resolve API keys to users if the `x-api-key` header is present
- The `@ApiKeyAuth()` decorator is no longer required for API key resolution
- Invalid API keys still throw `UnauthorizedException`
- Endpoints without API keys simply don't get a user context (they're not rejected)

## Usage with Playwright

### 1. Set Environment Variable

In your Playwright test environment, ensure `NODE_ENV=test`:

```bash
NODE_ENV=test npm run start:dev
```

Or in your `.env.test` file:
```
NODE_ENV=test
```

### 2. Configure Playwright to Send API Keys

Add the API key header to all requests in your Playwright configuration:

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    baseURL: 'http://localhost:3002',
    extraHTTPHeaders: {
      'x-api-key': 'your-test-api-key-here',
    },
  },
});
```

Or set it per-request:

```typescript
await page.request.get('/api/endpoint', {
  headers: {
    'x-api-key': 'your-test-api-key-here',
  },
});
```

### 3. Create Test API Keys

Make sure you have valid API keys in your test database that resolve to test users.

## Security Considerations

- **Never deploy with `NODE_ENV=test` in production**
- Test mode should only be used in isolated test environments
- The implementation checks `NODE_ENV` explicitly to prevent accidental misuse
- Consider using separate API keys for testing that have appropriate permissions

## Implementation Details

The logic in [api-key-auth.guard.ts](../apps/backend-services/src/auth/api-key-auth.guard.ts):

```typescript
const isTestMode = this.configService.get<string>("NODE_ENV") === "test";
const shouldResolveApiKey = allowApiKeyAuth || isTestMode;
```

This ensures:
1. If endpoint has `@ApiKeyAuth()` → always resolve API key
2. If `NODE_ENV=test` → resolve API key on any endpoint
3. Otherwise → skip API key resolution

The user resolution and validation logic remains the same - only the trigger condition changes.
