/**
 * Centralized auth-related configuration constants.
 *
 * Values are read from `process.env` at module load time with sensible defaults.
 * For local development with a `.env` file, `import 'dotenv/config'` is called
 * at the top of `main.ts` to ensure environment variables are populated before
 * module resolution (and therefore before decorator evaluation).
 *
 * In production (Docker, k8s, systemd) environment variables are set externally,
 * so they are available before the process starts.
 *
 * @see apps/backend-services/README.md for the full list of environment variables.
 */

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// ---------------------------------------------------------------------------
// Global Rate Limiting (ThrottlerModule)
// ---------------------------------------------------------------------------

/** Time window (ms) for the global @nestjs/throttler rate limit. */
export const THROTTLE_GLOBAL_TTL_MS = envInt("THROTTLE_GLOBAL_TTL_MS", 60_000);

/** Maximum requests per IP within the global window. */
export const THROTTLE_GLOBAL_LIMIT = envInt("THROTTLE_GLOBAL_LIMIT", 100);

// ---------------------------------------------------------------------------
// Auth Endpoint Rate Limiting (login, callback, logout)
// ---------------------------------------------------------------------------

/** Time window (ms) for auth endpoint throttle (login, callback, logout). */
export const THROTTLE_AUTH_TTL_MS = envInt("THROTTLE_AUTH_TTL_MS", 60_000);

/** Maximum requests per IP within the auth endpoint window. */
export const THROTTLE_AUTH_LIMIT = envInt("THROTTLE_AUTH_LIMIT", 10);

// ---------------------------------------------------------------------------
// Token Refresh Rate Limiting
// ---------------------------------------------------------------------------

/** Time window (ms) for the token refresh endpoint throttle. */
export const THROTTLE_AUTH_REFRESH_TTL_MS = envInt(
  "THROTTLE_AUTH_REFRESH_TTL_MS",
  60_000,
);

/** Maximum requests per IP within the refresh endpoint window. */
export const THROTTLE_AUTH_REFRESH_LIMIT = envInt(
  "THROTTLE_AUTH_REFRESH_LIMIT",
  5,
);

// ---------------------------------------------------------------------------
// API Key Failed-Attempt Throttling (ApiKeyAuthGuard)
// ---------------------------------------------------------------------------

/** Maximum failed API key validation attempts per IP before blocking with 429. */
export const API_KEY_MAX_FAILED_ATTEMPTS = envInt(
  "API_KEY_MAX_FAILED_ATTEMPTS",
  20,
);

/** Time window (ms) for tracking failed API key attempts per IP. */
export const API_KEY_FAILED_WINDOW_MS = envInt(
  "API_KEY_FAILED_WINDOW_MS",
  60_000,
);

/** Interval (ms) for sweeping stale failure records from memory. */
export const API_KEY_SWEEP_INTERVAL_MS = envInt(
  "API_KEY_SWEEP_INTERVAL_MS",
  60_000,
);
