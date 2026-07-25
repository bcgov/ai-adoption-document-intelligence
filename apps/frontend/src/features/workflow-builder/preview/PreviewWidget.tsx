/**
 * `PreviewWidget` — dispatch shell choosing the right per-node preview
 * widget based on the cached row's `outputKind`. Mounted under every
 * node renderer via `<NodePreviewOverlay>` (which resolves
 * `workflowId` + `activeRunId` from `RunStateContext`).
 *
 * The dispatch is intentionally a flat `switch` so the parallel widget
 * stories (US-142 → US-145) can fill in each widget's body without
 * touching this file. Unknown `outputKind`s render nothing (no preview
 * pane) so the canvas stays uncluttered (§4.1 in the design doc).
 *
 * Loading + error states are owned by this shell (§4.6):
 *
 *   | hook state           | render                                    |
 *   |----------------------|-------------------------------------------|
 *   | `isLoading`          | `<Skeleton h={120} radius="sm" />`        |
 *   | `error` set          | `<Alert color="red">Preview unavailable</Alert>` |
 *   | `data === null`      | the derived `NoOutputReason` (see `no-output-state.ts`) — `evicted` gets `<CacheEvictedAlert>` (US-155: Re-run repopulates the row); every other reason gets `<NoOutputNotice>` |
 *
 * G-012: `data === null` used to render a single sentence for `pending`,
 * `running`, `cancelled` and absent, and only in replay — during a live Try
 * the branch was a bare `return null`, so the most informative moment showed a
 * blank. Every reason now has its own state, its own copy, and its own
 * `data-state`, live runs included.
 *
 * The maxHeight of the preview pane is constrained (200px) so the
 * canvas stays readable; widgets handle their own internal scrolling.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L30 + L34
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-141-preview-hook-and-dispatch-shell.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.1 + §4.6
 */

import { resolveCtxBinding } from "@ai-di/graph-workflow";
import { Alert, Box, Skeleton } from "@mantine/core";
import type { ReactNode } from "react";

import type { NodeRunStatusValue } from "../run/node-status.types";
import { useOptionalRunState } from "../run/RunStateContext";
import { CacheEvictedAlert } from "./CacheEvictedAlert";
import { NoOutputNotice } from "./NoOutputNotice";
import {
  describeNoOutput,
  noOutputReasonForNode,
  type PreviewState,
} from "./no-output-state";
import type { ActivityOutputPreview } from "./preview.types";
import { renderKindValue } from "./render-kind-value";
import { useActivityOutputPreview } from "./useActivityOutputPreview";

/**
 * Max height of the preview pane (px). Constrains every widget so the
 * canvas stays readable; widgets handle their own internal scroll /
 * pagination (§4 design doc).
 */
export const PREVIEW_MAX_HEIGHT_PX = 200;

export interface PreviewWidgetProps {
  workflowId: string;
  nodeId: string;
  /**
   * Optional Temporal workflow execution id. When supplied, the hook
   * scopes the cache lookup to that run's execution window (replay
   * mode); when omitted, returns the most-recent fresh row.
   */
  runId?: string;
  /**
   * True only when the run is being REPLAYED (not a live Try). §4.7: the
   * "cache evicted" recovery alert must only appear in replay mode — during
   * a live Try, `runId` is set but nodes the run hasn't reached yet 404 on
   * the preview-cache, which is normal, not an eviction.
   */
  isReplay?: boolean;
  /**
   * The ctx key the previewed node binds its (first) output to — the key the
   * value lives under inside the nested `outputCtx` delta. Supplied by the
   * mounting renderer, which has the node's output bindings. When absent, no
   * value is read (nothing to preview).
   */
  outputCtxKey?: string;
  /**
   * The node's run status in the active run. Drives `noOutputReasonForNode`:
   * it tells a genuine cache eviction (`succeeded` / `skipped` — the node
   * produced output but its row was TTL-evicted, and Re-run repopulates it)
   * apart from failed / cancelled / still-running / never-reached, each of
   * which gets its own copy. Absent means the run's node-status map has no
   * entry for this node.
   */
  nodeStatus?: NodeRunStatusValue;
  /**
   * Whether this node produces a cacheable activity output. Control-flow nodes
   * (switch / map / join / humanGate / childWorkflow / pollUntil) never write an
   * output-cache row, so a missing row for them is neither a TTL eviction nor a
   * "didn't run" — there's simply nothing to preview. Defaults to `true`
   * (activity / source nodes); the canvas passes `false` for control-flow nodes
   * so they stay silent instead of showing a misleading "cache evicted" alert.
   */
  producesOutput?: boolean;
}

/**
 * Dispatch shell — switches on the cache row's `outputKind` and
 * renders the matching widget. Unknown kinds render nothing.
 *
 * Test-only callers can mount this directly; the production mount is
 * via `<NodePreviewOverlay nodeId={node.id} />` (below) which resolves
 * `workflowId` + `activeRunId` from `RunStateContext`.
 */
export function PreviewWidget({
  workflowId,
  nodeId,
  runId,
  isReplay = false,
  outputCtxKey,
  nodeStatus,
  producesOutput = true,
}: PreviewWidgetProps): ReactNode {
  const { data, isLoading, error } = useActivityOutputPreview(
    workflowId,
    nodeId,
    runId,
  );

  if (isLoading) {
    return (
      <Box
        data-testid={`preview-widget-${nodeId}`}
        data-state={"loading" satisfies PreviewState}
      >
        <Skeleton h={120} radius="sm" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        data-testid={`preview-widget-${nodeId}`}
        data-state={"error" satisfies PreviewState}
      >
        <Alert color="red" variant="light">
          Preview unavailable
        </Alert>
      </Box>
    );
  }

  if (data === null) {
    // No cache row. G-012: every reason that can be true here gets its OWN
    // state and its OWN copy — including during a LIVE run, where this branch
    // used to `return null` and show the author nothing at exactly the moment
    // they are watching a Try take an unexpected branch.
    //
    // `isReplay` (plus a non-empty runId) is what tells us the run is OVER:
    // only then does an absent node status mean "control never came this way"
    // rather than "not yet".
    const hasRun = runId !== undefined && runId !== "";
    const reason = noOutputReasonForNode({
      status: nodeStatus,
      runFinished: isReplay && hasRun,
      producesOutput,
      hasActiveRun: hasRun,
    });
    const copy = describeNoOutput(reason);

    // Eviction is the ONE reason with a working recovery: the node genuinely
    // produced output and re-running repopulates the row. Every other reason
    // must not offer it — re-running would repopulate nothing, and mid-Try it
    // would duplicate or cancel the in-flight run.
    if (copy.offersRerun && hasRun) {
      return (
        <Box
          data-testid={`preview-widget-${nodeId}`}
          data-state={"evicted" satisfies PreviewState}
        >
          <CacheEvictedAlert
            workflowId={workflowId}
            runId={runId}
            nodeId={nodeId}
          />
        </Box>
      );
    }

    return (
      <Box data-testid={`preview-widget-${nodeId}`} data-state={reason}>
        <NoOutputNotice reason={reason} />
      </Box>
    );
  }

  const content = renderForOutputKind(data, outputCtxKey);
  if (content === null) {
    // G-011 (Task 2) removes this branch: a kind with no dedicated renderer
    // currently produces an indistinguishable blank card.
    return null;
  }

  return (
    <Box
      data-testid={`preview-widget-${nodeId}`}
      data-state={"ready" satisfies PreviewState}
      data-output-kind={data.outputKind ?? ""}
      style={{ maxHeight: PREVIEW_MAX_HEIGHT_PX, overflow: "hidden" }}
    >
      {content}
    </Box>
  );
}

/**
 * Pure dispatch — reads the previewed value out of the nested `outputCtx`
 * delta at the producing port's bound `ctxKey` (via `resolveCtxBinding`, the
 * SAME read the runtime and the wire-peek use), then hands it to
 * `renderKindValue`, which resolves the kind's `baseKind` family root and picks
 * the widget. Reading by ctxKey — not by a fixed family slot name — is what
 * lets a producer bound to any ctxKey (`preparedFileData`, `__auto.<node>.<port>`,
 * a namespaced `doc.*` key, …) render; the old fixed `outputCtx.document` /
 * `.segments` slots only ever matched ctxKeys literally named that.
 */
function renderForOutputKind(
  data: ActivityOutputPreview,
  outputCtxKey: string | undefined,
): ReactNode {
  const value =
    outputCtxKey !== undefined && outputCtxKey !== ""
      ? resolveCtxBinding(outputCtxKey, data.outputCtx)
      : undefined;
  return renderKindValue(data.outputKind, value);
}

export interface NodePreviewOverlayProps {
  nodeId: string;
  /**
   * The ctx key the node binds its (first) output to — where the previewed
   * value lives inside the cached `outputCtx` delta. The mounting renderer
   * resolves it from the node's own output bindings (it holds the node data;
   * the overlay only knows the id). Absent → nothing to read.
   */
  outputCtxKey?: string;
  /**
   * Whether this node produces a cacheable output. Passed `false` by the
   * control-flow / switch renderers so their overlays stay silent in replay
   * instead of showing a misleading "cache evicted" alert (they never write an
   * output-cache row). Defaults to `true`.
   */
  producesOutput?: boolean;
}

/**
 * Thin wrapper mounted at the bottom of every node renderer. Resolves
 * `workflowId` + `activeRunId` from `RunStateContext` and forwards
 * them to `<PreviewWidget>`. Soft-fails when no `<RunStateProvider>`
 * is mounted (legacy unit tests) so node-renderer tests don't need
 * the context plumbing.
 */
export function NodePreviewOverlay({
  nodeId,
  outputCtxKey,
  producesOutput = true,
}: NodePreviewOverlayProps): ReactNode {
  const ctx = useOptionalRunState();
  if (!ctx) {
    return null;
  }
  // The `workflowId` from `RunStateContext` can be the empty string
  // while a brand-new workflow is being created (the editor mounts the
  // provider with `workflowId={workflowId ?? ""}` per
  // `WorkflowEditorV2Page.tsx`). In that case there's nothing to query
  // and the hook's `enabled` guard already short-circuits — but we
  // skip the mount entirely so even the test-id wrapper stays absent
  // until the workflow has an id.
  if (!ctx.workflowId) {
    return null;
  }
  // Idle suppression — mirror `NodeStatusBadgeOverlay`. A per-node preview is
  // meaningful only while a run (Try) or replay is active. With no active run,
  // the hook would fetch the most-recent cached row from a PRIOR run and show
  // it as if it were current state — confusing, and inconsistent with the
  // status badges (also idle-suppressed). Stay empty until a run is selected.
  if (!ctx.activeRunId) {
    return null;
  }
  return (
    <PreviewWidget
      workflowId={ctx.workflowId}
      nodeId={nodeId}
      runId={ctx.activeRunId ?? undefined}
      isReplay={ctx.isReplay}
      outputCtxKey={outputCtxKey}
      nodeStatus={ctx.nodeStatuses[nodeId]?.status}
      producesOutput={producesOutput}
    />
  );
}
