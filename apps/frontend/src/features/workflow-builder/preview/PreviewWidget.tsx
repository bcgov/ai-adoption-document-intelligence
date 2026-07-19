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
 *   | `data === null && runId` | `<CacheEvictedAlert>` (US-155 — small red Alert + Re-run button that fetches historical `initialCtx` and POSTs a fresh `/runs`) |
 *   | `data === null && !runId` | `null` (silent — node hasn't run yet) |
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

import { useOptionalRunState } from "../run/RunStateContext";
import { CacheEvictedAlert } from "./CacheEvictedAlert";
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
}: PreviewWidgetProps): ReactNode {
  const { data, isLoading, error } = useActivityOutputPreview(
    workflowId,
    nodeId,
    runId,
  );

  if (isLoading) {
    return (
      <Box data-testid={`preview-widget-${nodeId}`} data-state="loading">
        <Skeleton h={120} radius="sm" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box data-testid={`preview-widget-${nodeId}`} data-state="error">
        <Alert color="red" variant="light">
          Preview unavailable
        </Alert>
      </Box>
    );
  }

  if (data === null) {
    // Cache row gone (404). §4.7: only surface the cache-evicted recovery
    // Alert + Re-run button (US-155) in REPLAY mode, where a missing row
    // genuinely means the TTL evicted it. During a live Try, `runId` is also
    // set but nodes the run hasn't reached yet 404 on the preview-cache — that
    // is normal, so stay silent instead of flooding the canvas with false
    // "cache evicted" alerts (clicking Re-run there would duplicate/cancel the
    // in-flight Try).
    if (isReplay && runId !== undefined && runId !== "") {
      return (
        <Box data-testid={`preview-widget-${nodeId}`} data-state="evicted">
          <CacheEvictedAlert
            workflowId={workflowId}
            runId={runId}
            nodeId={nodeId}
          />
        </Box>
      );
    }
    // Live Try (not-yet-run node) or no `runId` — stay silent so the canvas
    // isn't cluttered with empty/false panes.
    return null;
  }

  const content = renderForOutputKind(data, outputCtxKey);
  if (content === null) {
    return null;
  }

  return (
    <Box
      data-testid={`preview-widget-${nodeId}`}
      data-state="ready"
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
  return (
    <PreviewWidget
      workflowId={ctx.workflowId}
      nodeId={nodeId}
      runId={ctx.activeRunId ?? undefined}
      isReplay={ctx.isReplay}
      outputCtxKey={outputCtxKey}
    />
  );
}
