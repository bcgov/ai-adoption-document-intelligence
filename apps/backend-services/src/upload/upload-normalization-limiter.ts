import { availableParallelism, cpus } from "node:os";
import { Injectable } from "@nestjs/common";

class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

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

  private release(): void {
    this.active -= 1;
    const next = this.waiting.shift();
    if (next) {
      next();
    }
  }
}

export function getUploadNormalizationConcurrency(): number {
  const detectedParallelism =
    typeof availableParallelism === "function"
      ? availableParallelism()
      : cpus().length;
  return Math.max(2, detectedParallelism);
}

@Injectable()
export class UploadNormalizationLimiter {
  private readonly semaphore = new Semaphore(
    getUploadNormalizationConcurrency(),
  );

  run<T>(task: () => Promise<T>): Promise<T> {
    return this.semaphore.run(task);
  }
}
