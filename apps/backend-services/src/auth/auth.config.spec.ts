/**
 * Tests for auth.config.ts — verifies that env-configurable auth constants
 * read from process.env with correct defaults.
 */

describe("auth.config", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    // Restore original env and clear the module cache so constants are re-evaluated
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it("should use defaults when no env vars are set", async () => {
    delete process.env.THROTTLE_GLOBAL_TTL_MS;
    delete process.env.THROTTLE_GLOBAL_LIMIT;
    delete process.env.THROTTLE_AUTH_TTL_MS;
    delete process.env.THROTTLE_AUTH_LIMIT;
    delete process.env.THROTTLE_AUTH_REFRESH_TTL_MS;
    delete process.env.THROTTLE_AUTH_REFRESH_LIMIT;
    delete process.env.API_KEY_MAX_FAILED_ATTEMPTS;
    delete process.env.API_KEY_FAILED_WINDOW_MS;
    delete process.env.API_KEY_SWEEP_INTERVAL_MS;

    const config = await import("./auth.config");

    expect(config.THROTTLE_GLOBAL_TTL_MS).toBe(60_000);
    expect(config.THROTTLE_GLOBAL_LIMIT).toBe(100);
    expect(config.THROTTLE_AUTH_TTL_MS).toBe(60_000);
    expect(config.THROTTLE_AUTH_LIMIT).toBe(10);
    expect(config.THROTTLE_AUTH_REFRESH_TTL_MS).toBe(60_000);
    expect(config.THROTTLE_AUTH_REFRESH_LIMIT).toBe(5);
    expect(config.API_KEY_MAX_FAILED_ATTEMPTS).toBe(20);
    expect(config.API_KEY_FAILED_WINDOW_MS).toBe(60_000);
    expect(config.API_KEY_SWEEP_INTERVAL_MS).toBe(60_000);
  });

  it("should read custom values from process.env", async () => {
    process.env.THROTTLE_GLOBAL_TTL_MS = "120000";
    process.env.THROTTLE_GLOBAL_LIMIT = "200";
    process.env.THROTTLE_AUTH_TTL_MS = "30000";
    process.env.THROTTLE_AUTH_LIMIT = "5";
    process.env.THROTTLE_AUTH_REFRESH_TTL_MS = "15000";
    process.env.THROTTLE_AUTH_REFRESH_LIMIT = "3";
    process.env.API_KEY_MAX_FAILED_ATTEMPTS = "10";
    process.env.API_KEY_FAILED_WINDOW_MS = "30000";
    process.env.API_KEY_SWEEP_INTERVAL_MS = "120000";

    const config = await import("./auth.config");

    expect(config.THROTTLE_GLOBAL_TTL_MS).toBe(120_000);
    expect(config.THROTTLE_GLOBAL_LIMIT).toBe(200);
    expect(config.THROTTLE_AUTH_TTL_MS).toBe(30_000);
    expect(config.THROTTLE_AUTH_LIMIT).toBe(5);
    expect(config.THROTTLE_AUTH_REFRESH_TTL_MS).toBe(15_000);
    expect(config.THROTTLE_AUTH_REFRESH_LIMIT).toBe(3);
    expect(config.API_KEY_MAX_FAILED_ATTEMPTS).toBe(10);
    expect(config.API_KEY_FAILED_WINDOW_MS).toBe(30_000);
    expect(config.API_KEY_SWEEP_INTERVAL_MS).toBe(120_000);
  });

  it("should fall back to default for non-numeric env values", async () => {
    process.env.THROTTLE_GLOBAL_LIMIT = "not-a-number";
    process.env.API_KEY_MAX_FAILED_ATTEMPTS = "";

    const config = await import("./auth.config");

    expect(config.THROTTLE_GLOBAL_LIMIT).toBe(100);
    expect(config.API_KEY_MAX_FAILED_ATTEMPTS).toBe(20);
  });
});
