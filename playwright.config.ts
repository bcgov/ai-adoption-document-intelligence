import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from backend .env file
dotenv.config({ path: path.resolve(__dirname, 'apps/backend-services/.env') });

// Set default TEST_API_KEY if not provided (matches seed.ts default)
if (!process.env.TEST_API_KEY) {
  process.env.TEST_API_KEY = '69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY';
}

/**
 * Playwright configuration for API and E2E tests
 */
// Tag gating for the workflow-builder suite (tests/e2e/workflow-builder):
//   @infra → needs the deno-runner sidecar + a Temporal worker live (Deno
//            sandbox execution, Try-in-place runs).
//   @llm   → drives the real LLM (Azure/Anthropic) — non-deterministic + costs
//            tokens; the deterministic CI path stubs the model instead.
// Both are EXCLUDED by default so `npm run test:e2e` is hermetic. Opt in with:
//   RUN_INFRA=1 npm run test:e2e            (include @infra)
//   RUN_LLM=1   npm run test:e2e            (include @llm)
//   RUN_INFRA=1 RUN_LLM=1 npm run test:e2e  (include both)
const excludedTags: RegExp[] = [];
if (!process.env.RUN_INFRA) excludedTags.push(/@infra/);
if (!process.env.RUN_LLM) excludedTags.push(/@llm/);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Local runs share ONE backend instance behind a global rate limiter
  // (THROTTLE_GLOBAL_LIMIT, default 100 req/min/IP) — unbounded workers
  // (= CPU cores/2, 10+ on dev boxes) make full-suite runs 429-storm the
  // backend: preview/status/catalog fetches error out and canvas
  // interactions stall. 6 keeps the suite fast without tripping the limit;
  // override with PLAYWRIGHT_WORKERS if your backend runs a higher limit.
  workers: process.env.CI
    ? 1
    : process.env.PLAYWRIGHT_WORKERS
      ? Number(process.env.PLAYWRIGHT_WORKERS)
      : 6,
  reporter: 'html',
  grepInvert: excludedTags.length > 0 ? excludedTags : undefined,

  // Global setup: Reset database before all tests
  globalSetup: require.resolve('./tests/global-setup.ts'),

  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: undefined, // Assume app is already running
});
