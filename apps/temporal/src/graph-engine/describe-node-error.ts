/**
 * Turn a thrown node failure into the message a human should read.
 *
 * Temporal wraps every activity failure in an `ActivityFailure` envelope whose
 * own `message` is the constant `"Activity task failed"`. The real cause — the
 * `ApplicationFailure` the activity threw — hangs off `.cause`. Reading
 * `error.message` therefore reported `"Activity task failed"` for every failed
 * node, which is what the canvas, the run-history drawer and the
 * `node-statuses` API all showed: a red step with no reason on it.
 *
 * A developer hitting a 404 from Azure Document Intelligence saw only
 * `"Activity task failed"` and could not tell a missing credential from a
 * wrong model id from a code defect. This helper walks the `cause` chain and
 * returns the outermost message that is not one of Temporal's generic
 * envelopes, so the failure the activity actually reported reaches the UI.
 */

/**
 * Messages the Temporal SDK puts on failure *envelopes*. They describe the
 * kind of thing that failed, never why, so they are skipped whenever the chain
 * carries something more specific underneath.
 */
const WRAPPER_MESSAGES: ReadonlySet<string> = new Set([
  "Activity task failed",
  "Activity cancelled",
  "Child Workflow execution failed",
  "Workflow execution failed",
  "Local activity failed",
]);

/** Defensive bound: a malformed cause chain must never spin the workflow. */
const MAX_CAUSE_DEPTH = 10;

function messageOf(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function causeOf(value: unknown): unknown {
  if (value instanceof Error) {
    return (value as Error & { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The most specific message in a thrown failure's cause chain.
 *
 * Returns the first message that is not a Temporal envelope; falls back to the
 * outermost message (and then to `String(error)`) when the whole chain is
 * generic, so the result is never an empty string.
 */
export function describeNodeError(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();

  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || current === undefined || seen.has(current)) {
      break;
    }
    seen.add(current);

    const message = messageOf(current);
    if (message.length > 0) {
      messages.push(message);
    }
    current = causeOf(current);
  }

  const specific = messages.find((message) => !WRAPPER_MESSAGES.has(message));
  if (specific !== undefined) {
    return specific;
  }

  return messages[0] ?? String(error);
}
