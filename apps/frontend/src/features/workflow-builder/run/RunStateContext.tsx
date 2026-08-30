/**
 * `RunStateContext` — single source of truth for the V2 editor's Try /
 * replay UI state. Owns the active run id, the replay flag, and the
 * live `nodeStatuses` map driven by `useNodeStatuses`. Renderers read
 * their per-node status via `useNodeRunStatus(nodeId)` — they never
 * call `useNodeStatuses` directly because they don't know which
 * workflow / run they belong to.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L32
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-138-node-status-badge.md
 *   - docs-md/workflows/TRY_IN_PLACE_DESIGN.md §3.5
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type {
  NodeRunStatus,
  NodeRunStatusValue,
  NodeStatusesMap,
} from "./node-status.types";
import { useNodeStatuses } from "./useNodeStatuses";

/**
 * Wire shape of the run-state context. `nodeStatuses` is always a plain
 * object (never undefined) so consumer renderers can treat `absent ===
 * pending` without a guard.
 */
/**
 * G-004 — identifies the workflow version a replayed run executed against
 * (`RunSummary.workflowVersionId` / `.versionNumber`). Replay renders the
 * graph THIS names, not whatever happens to be on screen.
 */
export interface ReplayVersionRef {
  id: string;
  versionNumber: number;
}

export interface RunStateContextValue {
  workflowId: string;
  activeRunId: string | null;
  setActiveRunId: (id: string | null) => void;
  isReplay: boolean;
  setIsReplay: (b: boolean) => void;
  /**
   * G-004 — the version the replayed run ran against, or `null` when not
   * replaying. Cleared automatically whenever replay is left (`setIsReplay(false)`)
   * or the run is cleared (`setActiveRunId(null)`), so no exit path can strand
   * the canvas on a historical graph.
   */
  replayVersion: ReplayVersionRef | null;
  /** Enter replay for `runId`, pinned to the version that run executed. */
  startReplay: (runId: string, version: ReplayVersionRef) => void;
  nodeStatuses: NodeStatusesMap;
}

const RunStateReactContext = createContext<RunStateContextValue | null>(null);

export interface RunStateProviderProps {
  workflowId: string;
  children: ReactNode;
}

/**
 * Provider mounted in `WorkflowEditorV2Page` wrapping the canvas. Owns
 * the `activeRunId` + `isReplay` state and forwards them to
 * `useNodeStatuses`. When no run has been kicked off
 * (`activeRunId === null`) the query is disabled — the exposed
 * `nodeStatuses` map stays empty and every node renderer shows the
 * "pending" badge by default (Scenario 4).
 */
export function RunStateProvider({
  workflowId,
  children,
}: RunStateProviderProps): ReactNode {
  const [activeRunId, setActiveRunIdState] = useState<string | null>(null);
  const [isReplay, setIsReplayState] = useState<boolean>(false);
  const [replayVersion, setReplayVersion] = useState<ReplayVersionRef | null>(
    null,
  );

  // G-004 — every path out of replay must also drop the version pin,
  // otherwise the canvas is left rendering a historical graph with nothing
  // saying so. Wrapping the two setters covers all of them (the top-bar
  // "Clear", the Try tab's `setIsReplay(false)`, the cache-evicted re-run)
  // without each caller having to remember.
  const setActiveRunId = useCallback((id: string | null) => {
    setActiveRunIdState(id);
    if (id === null) {
      setIsReplayState(false);
      setReplayVersion(null);
    }
  }, []);
  const setIsReplay = useCallback((b: boolean) => {
    setIsReplayState(b);
    if (!b) setReplayVersion(null);
  }, []);
  const startReplay = useCallback(
    (runId: string, version: ReplayVersionRef) => {
      setActiveRunIdState(runId);
      setIsReplayState(true);
      setReplayVersion(version);
    },
    [],
  );

  const statusesQuery = useNodeStatuses(workflowId, activeRunId, {
    active: !isReplay,
  });

  const nodeStatuses: NodeStatusesMap = statusesQuery.data ?? {};

  const value: RunStateContextValue = useMemo(
    () => ({
      workflowId,
      activeRunId,
      setActiveRunId,
      isReplay,
      setIsReplay,
      replayVersion,
      startReplay,
      nodeStatuses,
    }),
    [
      workflowId,
      activeRunId,
      setActiveRunId,
      isReplay,
      setIsReplay,
      replayVersion,
      startReplay,
      nodeStatuses,
    ],
  );

  return (
    <RunStateReactContext.Provider value={value}>
      {children}
    </RunStateReactContext.Provider>
  );
}

/**
 * Read the full run-state value. Throws when called outside a
 * `<RunStateProvider>` so consumer bugs surface early in dev rather
 * than silently rendering "pending" everywhere.
 */
export function useRunState(): RunStateContextValue {
  const ctx = useContext(RunStateReactContext);
  if (!ctx) {
    throw new Error("useRunState must be used inside <RunStateProvider>");
  }
  return ctx;
}

/**
 * Soft-failing variant of `useRunState` — returns `null` when no
 * provider is mounted. Used by the badge overlays so node renderers
 * rendered in isolation (e.g. existing pre-Phase-4 unit tests that
 * don't mount `<RunStateProvider>`) keep working: the overlay simply
 * shows the gray "pending" placeholder. Production callers always
 * sit beneath the provider mounted by `WorkflowEditorV2Page`.
 */
export function useOptionalRunState(): RunStateContextValue | null {
  return useContext(RunStateReactContext);
}

/**
 * The "pending" stand-in returned when a node id is absent from the
 * status map. Per `useNodeStatuses`' contract, nodes the workflow never
 * walked (or all nodes before any Try has happened) stay absent — the
 * canvas treats absent ≡ pending (US-135 Scenario 5).
 */
const PENDING_STATUS: NodeRunStatus = { status: "pending" };

/**
 * Per-node read hook. Returns the live `NodeRunStatus` for `nodeId` or
 * a synthetic `{ status: "pending" }` when the id isn't in the map.
 * Renderers should call this — never `useNodeStatuses` — because they
 * don't know which workflow / run they belong to.
 *
 * Soft-fails outside a `<RunStateProvider>` so node renderers
 * exercised in isolation by unit tests (which don't need a live run
 * surface) keep working. Production callers always sit beneath the
 * provider mounted by `WorkflowEditorV2Page`.
 */
export function useNodeRunStatus(nodeId: string): NodeRunStatus {
  const ctx = useOptionalRunState();
  if (!ctx) return PENDING_STATUS;
  return ctx.nodeStatuses[nodeId] ?? PENDING_STATUS;
}

/**
 * Pure helper computing the aggregate status of a collapsed group.
 *
 *   - `failed`    — any member has failed
 *   - `running`   — any member is running
 *   - `cancelled` — no member is running and any member was cancelled
 *   - `skipped`   — every member is skipped (nothing actually executed)
 *   - `succeeded` — every member is terminal, at least one really ran
 *   - `pending`   — otherwise (empty member list, or work still to start)
 *
 * Precedence is `failed` > `running` > `cancelled` > `skipped` >
 * `succeeded` > `pending` — surfacing the most-urgent state at a glance.
 * (`failed` over `running` because a single failure is the canvas-level signal
 * the user must act on; xyflow batches re-renders so two adjacent ticks can't
 * visibly flip between the two.)
 *
 * G-095 — this used to return only four of the six statuses, so collapsing a
 * group DESTROYED information its expanded members were showing:
 *   - `skipped` folded into `succeeded`, so a group served entirely from cache
 *     showed a green tick instead of the violet bolt every member carried;
 *   - `cancelled` fell through to `pending`, so an aborted run's group read as
 *     "not started yet" — the opposite of what happened. That case became
 *     reachable rather than hypothetical when G-047 made `cancelled` a real
 *     `NodeRunStatusValue`.
 */
export function getAggregateStatus(
  memberIds: readonly string[],
  nodeStatuses: NodeStatusesMap,
): NodeRunStatusValue {
  if (memberIds.length === 0) return "pending";

  let hasRunning = false;
  let hasCancelled = false;
  let allTerminal = true;
  let allSkipped = true;

  for (const id of memberIds) {
    const entry = nodeStatuses[id];
    const status = entry?.status ?? "pending";
    if (status === "failed") {
      return "failed";
    }
    if (status === "running") {
      hasRunning = true;
      allTerminal = false;
      allSkipped = false;
      continue;
    }
    if (status === "cancelled") {
      hasCancelled = true;
      allSkipped = false;
      continue;
    }
    if (status !== "skipped") {
      allSkipped = false;
    }
    if (status !== "succeeded" && status !== "skipped") {
      allTerminal = false;
    }
  }

  if (hasRunning) return "running";
  // A cancelled member is terminal, so it must be reported before the
  // all-terminal checks below claim the group finished normally.
  if (hasCancelled) return "cancelled";
  if (allSkipped) return "skipped";
  if (allTerminal) return "succeeded";
  return "pending";
}

/**
 * Test-only helper exporting the provider context directly so unit
 * tests can stub `useNodeRunStatus` without spinning up TanStack /
 * MSW. Pass a fully-formed `RunStateContextValue` via `value`.
 */
export interface RunStateTestProviderProps {
  value: RunStateContextValue;
  children: ReactNode;
}

export function RunStateTestProvider({
  value,
  children,
}: RunStateTestProviderProps): ReactNode {
  return (
    <RunStateReactContext.Provider value={value}>
      {children}
    </RunStateReactContext.Provider>
  );
}

/**
 * Convenience builder for tests — fills the workflowId + setter fields
 * with sane defaults so callers only need to specify what they care
 * about (typically `nodeStatuses`).
 */
export function buildRunStateContextValue(
  partial: Partial<RunStateContextValue> & { workflowId?: string },
): RunStateContextValue {
  return {
    workflowId: partial.workflowId ?? "wf-test",
    activeRunId: partial.activeRunId ?? null,
    setActiveRunId: partial.setActiveRunId ?? (() => undefined),
    isReplay: partial.isReplay ?? false,
    setIsReplay: partial.setIsReplay ?? (() => undefined),
    replayVersion: partial.replayVersion ?? null,
    startReplay: partial.startReplay ?? (() => undefined),
    nodeStatuses: partial.nodeStatuses ?? {},
  };
}
