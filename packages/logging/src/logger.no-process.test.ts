/**
 * Regression: Temporal workflow bundles may import @ai-di/shared-logging; the workflow
 * isolate has no Node `process` global. Logger must load and no-op without throwing.
 */

describe("logger without global process", () => {
  it("loads and accepts log calls when process is absent", async () => {
    const saved = globalThis.process;
    // @ts-expect-error deliberate removal to mimic workflow isolate
    delete globalThis.process;
    jest.resetModules();
    try {
      const { createLogger, getLogLevel } = await import("./logger");
      expect(getLogLevel()).toBe("info");
      expect(() => createLogger("temporal-workflow").info("ok")).not.toThrow();
    } finally {
      globalThis.process = saved;
      jest.resetModules();
    }
  });
});
