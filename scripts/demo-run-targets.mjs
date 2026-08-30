/**
 * Identifiers shared by the two demo scripts.
 *
 *   - `seed-feature-demos.mjs` CREATES the demo workflows (HTTP only — backend
 *     + DB, no worker).
 *   - `seed-demo-runs.mjs` finds them again **by name** and executes REAL
 *     Temporal runs against them (needs the worker).
 *
 * The second script has no way to know which workflow is which except by the
 * name the first one wrote, and no way to poll a run except by the node ids
 * inside the graph. Both facts therefore live here, once, rather than as two
 * copies that drift the first time a demo is retitled — a drift whose only
 * symptom would be the runs script reporting "demo not found".
 */

/** Every seeded demo workflow's name starts with this. */
export const NAME_PREFIX = "🎯 Demo — ";

/**
 * The demos `seed-demo-runs.mjs` executes, keyed by the role each one plays in
 * the run-state coverage. `title` must match the `title` of the matching entry
 * in `seed-feature-demos.mjs`'s `DEMOS` array — the workflow's name is
 * `NAME_PREFIX + title`.
 */
export const RUN_DEMOS = {
  /** Green run, cache hit on a re-run, and a run that genuinely fails. */
  tryPreview: {
    title: "Try-in-place — run a workflow & see previews (Part 9)",
    sourceNodeId: "upload1",
    ctxKey: "documentUrl",
    nodeIds: ["upload1", "prep"],
  },
  /** A switch that routes on real data, and an error edge that is really taken. */
  branchError: {
    title: "Run states — a taken branch and a taken error path (Part 9)",
    sourceNodeId: "upload1",
    ctxKey: "documentUrl",
    /** Nodes reached on the success path (the switch routes to `markPdf`). */
    successNodeIds: ["upload1", "prep", "routeByType", "markPdf"],
    /** Nodes reached when `prep` fails and the error edge diverts the run. */
    errorNodeIds: ["upload1", "prep", "reject"],
  },
  /** A humanGate that really waits — the only source of an in-flight run. */
  humanGate: {
    title: "Run states — a run waiting on a person (Part 9)",
    sourceNodeId: "upload1",
    ctxKey: "documentUrl",
    /** The gate node; it stays `running` until somebody signals it. */
    gateNodeId: "approve",
    settledNodeIds: ["upload1", "prep"],
  },
  /** Two versions, so a run pinned to v1 can be replayed while head is v2. */
  replayVersions: {
    title: "Run states — replay against an older version (Part 12)",
    sourceNodeId: "upload1",
    ctxKey: "documentUrl",
    /** v1's nodes — v2 adds `markProcessing` after `prep`. */
    v1NodeIds: ["upload1", "prep"],
  },
};
