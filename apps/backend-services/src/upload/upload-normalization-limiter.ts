import { availableParallelism, cpus } from "node:os";
import { Injectable } from "@nestjs/common";

/**
 * In-process counting semaphore for async work.
 *
 * Tasks beyond the configured limit wait in FIFO order until a slot frees.
 * Used by {@link UploadNormalizationLimiter} to cap concurrent PDF/image
 * normalization without a cross-request queue or external coordinator.
 */
class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  /** @param limit Maximum number of tasks that may run at once (must be ≥ 1). */
  constructor(private readonly limit: number) {}

  /**
   * Acquire a slot, run `task`, then release the slot (even when `task` throws).
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  /** Reserve a slot immediately or enqueue until one is available. */
  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  /** Free a slot and wake the next queued waiter, if any. */
  private release(): void {
    this.active -= 1;
    const next = this.waiting.shift();
    if (next) {
      next();
    }
  }
}

/**
 * Concurrency cap for upload normalization on this process.
 *
 * Uses `availableParallelism()` when present (Node 19+), otherwise `cpus().length`,
 * floored at 2 so small containers still allow limited overlap.
 */
export function getUploadNormalizationConcurrency(): number {
  const detectedParallelism =
    typeof availableParallelism === "function"
      ? availableParallelism()
      : cpus().length;
  return Math.max(2, detectedParallelism);
}

/**
 * Nest injectable that bounds concurrent `normalizeToPdf` work per backend pod.
 *
 * JSON/base64 uploads still decode fully before normalization; this limiter only
 * prevents many large pdf-lib workspaces from running at once on one process.
 */
@Injectable()
export class UploadNormalizationLimiter {
  private readonly semaphore = new Semaphore(
    getUploadNormalizationConcurrency(),
  );

  /** Run `task` when a normalization slot is available. */
  run<T>(task: () => Promise<T>): Promise<T> {
    return this.semaphore.run(task);
  }
}
