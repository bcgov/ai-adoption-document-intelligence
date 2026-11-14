import { ApplicationFailure } from "@temporalio/activity";

export const DEFAULT_POLL_INTERVAL_SECONDS = 10;
export const DEFAULT_MAX_WAIT_SECONDS = 600;

export interface PollLoopOptions {
  /** Seconds to wait between polls. */
  pollIntervalSeconds?: number;
  /** Seconds to wait for a result before failing. */
  maxWaitSeconds?: number;
  /** What is being waited for; used in the timeout message. */
  description: string;
  /** Sleep seam so tests do not wait in real time. */
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Repeatedly runs `poll` until it reports a settled result.
 *
 * `poll` returns `{ done: true, value }` when finished and `{ done: false }`
 * to keep waiting. Errors thrown by `poll` propagate unchanged. Exceeding
 * `maxWaitSeconds` raises a non-retryable failure, because retrying the
 * activity would submit the document to Azure again.
 *
 * @param poll - A single poll attempt.
 * @param options - Timing and messaging options.
 * @returns The value from the settled poll.
 */
export async function pollUntilSettled<T>(
  poll: () => Promise<{ done: true; value: T } | { done: false }>,
  options: PollLoopOptions,
): Promise<T> {
  const intervalMs =
    (options.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS) * 1000;
  const maxWaitMs = (options.maxWaitSeconds ?? DEFAULT_MAX_WAIT_SECONDS) * 1000;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = Date.now();

  for (;;) {
    const outcome = await poll();
    if (outcome.done) {
      return outcome.value;
    }
    if (Date.now() - startedAt + intervalMs > maxWaitMs) {
      throw ApplicationFailure.create({
        message: `Timed out after ${Math.round(maxWaitMs / 1000)}s waiting for ${options.description}`,
        nonRetryable: true,
      });
    }
    await sleep(intervalMs);
  }
}
