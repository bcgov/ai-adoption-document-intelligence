/**
 * Runner Utilities
 *
 * Generic utilities for workflow execution.
 */

import { ApplicationFailure } from '@temporalio/workflow';

/**
 * Execute items with concurrency limiting
 *
 * Uses a semaphore pattern to limit parallel execution.
 */
export async function executeWithConcurrencyLimit<T>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T, index: number) => Promise<unknown>,
): Promise<unknown[]> {
  const results: unknown[] = new Array(items.length);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = i;

    // Create promise for this item
    const p = fn(item, index)
      .then((result) => {
        results[index] = result;
      })
      .finally(() => {
        // Remove from executing set when done
        const idx = executing.indexOf(p);
        if (idx !== -1) {
          executing.splice(idx, 1);
        }
      });

    executing.push(p);

    // Wait if we've hit the concurrency limit
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
    }
  }

  // Wait for all remaining promises
  await Promise.all(executing);

  return results;
}

/**
 * Parse duration string to milliseconds
 */
export function parseDurationToMs(duration: string): number {
  const trimmed = duration.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!match) {
    throw ApplicationFailure.create({
      type: 'GRAPH_EXECUTION_ERROR',
      message: `Invalid duration string: ${duration}`,
      nonRetryable: true,
    });
  }

  const value = Number(match[1]);
  const unit = match[2];
  const multiplier: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return Math.round(value * (multiplier[unit] ?? 1));
}
