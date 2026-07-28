/**
 * The typed state model for "this node has no output to preview" (G-012).
 *
 * Before this module the concept had **no type**: `PreviewWidget` computed a
 * single prose sentence covering `pending`, `running`, `cancelled` and absent,
 * emitted it under `data-state="not-run"`, and `WirePeekPopover` called the
 * same derived state `no-run` while typing `state` as a bare `string` and
 * emitting it from two further causes. One concept, two names, six loose
 * literals, and four genuinely different situations collapsed into one
 * sentence — each of which needs a DIFFERENT action from the author:
 *
 *   | reason             | what the author should do                        |
 *   |--------------------|--------------------------------------------------|
 *   | `no-run`           | run the workflow                                 |
 *   | `not-started`      | wait — the run hasn't reached this step           |
 *   | `running`          | wait — this step is executing now                |
 *   | `branch-not-taken` | look elsewhere — control went another way        |
 *   | `failed`           | read the error; the step produced nothing        |
 *   | `cancelled`        | the run is over; re-run if you still want output |
 *   | `evicted`          | Re-run to repopulate the cache (recovery exists) |
 *   | `not-previewable`  | nothing to do — this step never writes output    |
 *
 * **Eviction is deliberately in this union but is NOT a flavour of "didn't
 * run".** It is the only reason with a recovery action (the Re-run button in
 * `CacheEvictedAlert`), because it is the only reason where the output DID
 * exist. Folding it into "didn't run" would offer a Re-run that repopulates
 * nothing, or drop the Re-run that actually works — the regression this
 * module's `offersRerun` flag and its spec guard against.
 *
 * The `assertNever` guards below are the regression floor for the whole
 * class: the original bug was an unhandled `NodeRunStatusValue` falling into a
 * catch-all, so `noOutputReasonForNode` switches exhaustively over that union
 * and `describeNoOutput` switches exhaustively over this one. Adding a run
 * status — or a reason — without deciding its copy fails compilation.
 *
 * Source: G-012 in
 * feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md
 */

import type { NodeRunStatusValue } from "../run/node-status.types";

/**
 * Every reason a node can have no previewable output. Ordered roughly by the
 * run lifecycle. Exported as a value so specs can assert exhaustively over it.
 */
export const NO_OUTPUT_REASONS = [
  "no-run",
  "not-started",
  "running",
  "branch-not-taken",
  "failed",
  "cancelled",
  "evicted",
  "not-cached",
  "not-previewable",
] as const;

export type NoOutputReason = (typeof NO_OUTPUT_REASONS)[number];

/**
 * The full set of states a preview surface can be in. `data-state` on both
 * `PreviewWidget` and `WirePeekPopover` is typed as this, so the two surfaces
 * can no longer drift into different names for the same state.
 *
 *   - `loading` / `error` / `ready` — the query's own states.
 *   - `empty` — a cache row EXISTS but the requested ctx key holds no value
 *     (a wire bound to a key the producer never wrote). Distinct from every
 *     `NoOutputReason`: the step ran and produced *something*, just not here.
 *   - everything else — a `NoOutputReason`.
 */
export type PreviewState =
  | "loading"
  | "error"
  | "ready"
  | "empty"
  | NoOutputReason;

/** Compile-time exhaustiveness guard. */
function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unhandled variant ${JSON.stringify(value)}`);
}

export interface NoOutputCopy {
  reason: NoOutputReason;
  /** One sentence naming what actually happened. */
  message: string;
  /**
   * True only for `evicted` — the single reason whose output DID exist and
   * can be repopulated by re-running. Every other reason must NOT offer a
   * Re-run: it would repopulate nothing (and, mid-Try, would duplicate or
   * cancel the in-flight run).
   */
  offersRerun: boolean;
  /**
   * `neutral` — expected, transient, renders as dimmed text.
   * `notable` — a fact the author is probably debugging, renders as an Alert.
   * `silent` — nothing to say; the wrapper still carries `data-state` so the
   *   state is observable, but no copy is drawn (control-flow nodes would
   *   otherwise paper the canvas with identical grey boxes).
   */
  tone: "neutral" | "notable" | "silent";
}

/**
 * The copy + affordances for each reason. Exhaustive over `NoOutputReason`.
 */
export function describeNoOutput(
  reason: NoOutputReason,
  options?: {
    /**
     * D-18a — only a dynamic node's author can change whether its output is
     * cached (by tagging the script `@deterministic true`). A built-in
     * activity is `nonCacheable` by catalog design — `document.updateStatus`,
     * `azureOcr.submit`, every `benchmark.*` writer — and telling that author
     * to edit a script they do not have is an instruction they cannot follow.
     */
    isDynamicNode?: boolean;
  },
): NoOutputCopy {
  switch (reason) {
    case "no-run":
      return {
        reason,
        message: "Run this workflow to see what this step produces.",
        offersRerun: false,
        tone: "neutral",
      };
    case "not-started":
      return {
        reason,
        message: "Waiting — the run hasn't reached this step yet.",
        offersRerun: false,
        tone: "neutral",
      };
    case "running":
      return {
        reason,
        message: "Running now — output appears when this step finishes.",
        offersRerun: false,
        tone: "neutral",
      };
    case "branch-not-taken":
      return {
        reason,
        message:
          "This step was never reached — the run took a different branch.",
        offersRerun: false,
        tone: "notable",
      };
    case "failed":
      return {
        reason,
        message: "This step failed — no output was produced to preview.",
        offersRerun: false,
        tone: "notable",
      };
    case "cancelled":
      return {
        reason,
        message: "The run was cancelled before this step produced output.",
        offersRerun: false,
        tone: "notable",
      };
    case "evicted":
      return {
        reason,
        message:
          "This step's cached output has expired. Re-run to repopulate it.",
        offersRerun: true,
        tone: "notable",
      };
    case "not-cached":
      // D-12: distinct from `evicted`. Nothing expired — a
      // `@deterministic:false` script must re-execute every run (§3.3), so its
      // output is never written to the cache at all. Offering "Re-run to
      // repopulate" here promises something that cannot happen.
      return {
        reason,
        message:
          options?.isDynamicNode === true
            ? "This step ran, but its output isn't cached: the script is marked non-deterministic, so it re-executes every run instead of being stored. Tag it `@deterministic true` to make its output previewable."
            : "This step ran, but this activity never caches its output — it re-executes on every run instead of being stored, so there's nothing here to preview.",
        offersRerun: false,
        tone: "notable",
      };
    case "not-previewable":
      return {
        reason,
        message: "This step doesn't produce a previewable output.",
        offersRerun: false,
        tone: "silent",
      };
    default:
      return assertNever(reason, "describeNoOutput");
  }
}

export interface NoOutputInput {
  /**
   * The node's status in the active run. `undefined` means the run's
   * node-status map has no entry — the workflow never walked this node.
   */
  status: NodeRunStatusValue | undefined;
  /**
   * True when the run is over (replay). A missing status means "never
   * reached" once the run has finished, but only "not yet" while it is live —
   * the distinction the old single sentence could not express.
   */
  runFinished: boolean;
  /**
   * True when this node's output is never written to the cache at all — a
   * dynamic node whose script is `@deterministic:false` (surfaced by the
   * catalog as `nonCacheable`). Distinguishes D-12's "not-cached" from a real
   * TTL eviction.
   */
  neverCached?: boolean;
  /**
   * False for nodes that never write an output-cache row (switch / map / join
   * / humanGate / childWorkflow / pollUntil). Short-circuits to
   * `not-previewable`: for them a missing row is neither an eviction nor a
   * "didn't run".
   */
  producesOutput: boolean;
  /** False when no run is selected at all. */
  hasActiveRun: boolean;
}

/**
 * Derive the reason a node shows no output. **Exhaustive over
 * `NodeRunStatusValue`** — adding a run status without deciding its copy is a
 * compile error, which is the regression floor for this class of bug.
 */
export function noOutputReasonForNode(input: NoOutputInput): NoOutputReason {
  const { status, runFinished, producesOutput, hasActiveRun, neverCached } =
    input;
  if (!producesOutput) return "not-previewable";
  if (!hasActiveRun) return "no-run";
  if (status === undefined) {
    // No status entry: the workflow never walked this node. While the run is
    // live that only means "not yet"; once it has finished it means control
    // never came this way.
    return runFinished ? "branch-not-taken" : "not-started";
  }
  switch (status) {
    case "pending":
      return runFinished ? "branch-not-taken" : "not-started";
    case "running":
      return "running";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "succeeded":
    case "skipped":
      // D-12: a node the engine never caches (a `@deterministic:false` dynamic
      // node) has no row to have lost, so "evicted" would blame a TTL that
      // never applied and offer a recovery that cannot work.
      if (neverCached === true) return "not-cached";
      // Otherwise the node DID produce output (ran fresh, or was served from
      // cache), so a missing cache row is a genuine TTL eviction — the one
      // reason with a working recovery.
      return "evicted";
    default:
      return assertNever(status, "noOutputReasonForNode");
  }
}
