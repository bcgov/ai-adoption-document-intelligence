/**
 * Runner Utilities
 *
 * Generic utilities for workflow execution.
 */

import { ApplicationFailure } from "@temporalio/workflow";

/**
 * The result of running one item, recorded rather than thrown.
 *
 * `index` is the item's position in the input array on BOTH variants, so a
 * caller can always say which branch a failure belongs to — that is the
 * information the old "reject on first failure" behaviour destroyed along
 * with the sibling results.
 */
export type ConcurrentOutcome =
  | { status: "fulfilled"; index: number; value: unknown }
  | { status: "rejected"; index: number; reason: unknown };

/**
 * Execute items with concurrency limiting.
 *
 * Uses a semaphore pattern to limit parallel execution, and **settles** —
 * it never rejects. Previously a single failure rejected both the in-loop
 * `Promise.race` and the closing `Promise.all`, so one bad branch discarded
 * every sibling result that had already completed (G-026).
 *
 * This helper deliberately decides NO policy: it reports what happened per
 * item, in input order, and the caller (`executeMapNode`) decides what a
 * partial result means for that node. Keeping the two separate is what lets
 * the map honour `errorPolicy.onError` without this utility knowing that
 * error policies exist.
 *
 * Because the per-item promise now handles its own rejection, both the
 * in-loop wait and the closing wait are safe: neither can see a rejected
 * promise.
 */
export async function executeWithConcurrencyLimit<T>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T, index: number) => Promise<unknown>,
): Promise<ConcurrentOutcome[]> {
  const outcomes: ConcurrentOutcome[] = new Array(items.length);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const index = i;

    // Create promise for this item. The rejection handler is what makes the
    // helper settle rather than reject — `p` always fulfils.
    const p = fn(item, index)
      .then(
        (value) => {
          outcomes[index] = { status: "fulfilled", index, value };
        },
        (reason: unknown) => {
          outcomes[index] = { status: "rejected", index, reason };
        },
      )
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

  return outcomes;
}

/** The values of the items that succeeded, in original index order. */
export function fulfilledValues(outcomes: ConcurrentOutcome[]): unknown[] {
  const values: unknown[] = [];
  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") values.push(outcome.value);
  }
  return values;
}

/** The items that failed, in original index order. */
export function rejectedOutcomes(
  outcomes: ConcurrentOutcome[],
): Extract<ConcurrentOutcome, { status: "rejected" }>[] {
  return outcomes.filter(
    (o): o is Extract<ConcurrentOutcome, { status: "rejected" }> =>
      o.status === "rejected",
  );
}

/**
 * Parse duration string to milliseconds
 */
export function parseDurationToMs(duration: string): number {
  const trimmed = duration.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!match) {
    throw ApplicationFailure.create({
      type: "GRAPH_EXECUTION_ERROR",
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
