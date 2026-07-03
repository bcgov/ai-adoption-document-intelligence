jest.mock("node:os", () => ({
  availableParallelism: () => 2,
  cpus: () => [{}, {}, {}, {}],
}));

import {
  getUploadNormalizationConcurrency,
  UploadNormalizationLimiter,
} from "./upload-normalization-limiter";

describe("getUploadNormalizationConcurrency", () => {
  it("returns Math.max(2, availableParallelism)", () => {
    expect(getUploadNormalizationConcurrency()).toBe(2);
  });
});

describe("UploadNormalizationLimiter", () => {
  it("executes the wrapped task and returns its result", async () => {
    const limiter = new UploadNormalizationLimiter();
    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
  });

  it("queues tasks when the concurrency limit is reached", async () => {
    const limiter = new UploadNormalizationLimiter();
    let active = 0;
    let maxActive = 0;
    const unblock: Array<() => void> = [];

    const task = () =>
      limiter.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => {
          unblock.push(resolve);
        });
        active -= 1;
      });

    const pending = [task(), task(), task()];
    await new Promise((resolve) => setImmediate(resolve));
    expect(maxActive).toBe(2);
    expect(unblock).toHaveLength(2);

    unblock.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(unblock).toHaveLength(2);

    unblock.shift()?.();
    unblock.shift()?.();
    unblock.shift()?.();

    await Promise.all(pending);
    expect(maxActive).toBe(2);
  });
});
