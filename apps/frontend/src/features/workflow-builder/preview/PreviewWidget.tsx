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
 *   | `data === null && runId` | `<Alert color="red">Preview unavailable</Alert>` (US-155 replaces with cache-evicted UX + Re-run button) |
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

import { Alert, Box, Skeleton } from "@mantine/core";
import type { ReactNode } from "react";

import { useOptionalRunState } from "../run/RunStateContext";
import { ClassificationPreview } from "./ClassificationPreview";
import { DocumentPreview } from "./DocumentPreview";
import { OcrResultPreview } from "./OcrResultPreview";
import type { ActivityOutputPreview } from "./preview.types";
import { SegmentArrayPreview } from "./SegmentArrayPreview";
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
    // Cache row gone (404). When a `runId` was supplied the consumer
    // is in replay mode and the missing row means the TTL evicted it —
    // US-155 owns the dedicated cache-evicted Alert + Re-run button;
    // until that lands we show the same placeholder Alert as the
    // error branch.
    if (runId !== undefined && runId !== "") {
      return (
        <Box data-testid={`preview-widget-${nodeId}`} data-state="evicted">
          <Alert color="red" variant="light">
            Preview unavailable
          </Alert>
        </Box>
      );
    }
    // No `runId` — node simply hasn't been run yet. Stay silent so the
    // canvas isn't cluttered with empty panes (§4.1 design doc).
    return null;
  }

  const content = renderForOutputKind(data);
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
 * Pure dispatch — switches on `outputKind` and forwards the
 * appropriate ctx slot to the matching widget. Kept as a separate
 * helper so the widget stories (US-142 → US-145) can drop in their
 * components by replacing the corresponding `case` body (or the
 * widget file's body) without touching the loading / error branches.
 *
 * The ctx-slot key per `outputKind` mirrors the design doc's §4.1
 * example.
 */
function renderForOutputKind(data: ActivityOutputPreview): ReactNode {
  const { outputKind, outputCtx } = data;
  switch (outputKind) {
    case "Document":
    case "MultiPageDocument":
    case "SinglePageDocument":
      return <DocumentPreview value={outputCtx.document} />;
    case "Segment[]":
      return <SegmentArrayPreview value={outputCtx.segments} />;
    case "OcrResult":
    case "OcrFields":
      return <OcrResultPreview value={outputCtx.ocrResult} />;
    case "Classification":
      return <ClassificationPreview value={outputCtx.classification} />;
    default:
      // null `outputKind` OR an unsupported kind (`Segment` singular,
      // `OcrTable`, `ValidationResult`, `Reference`, `Artifact`, …).
      // Renders nothing — Phase 4.x adds further widgets here.
      return null;
  }
}

export interface NodePreviewOverlayProps {
  nodeId: string;
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
    />
  );
}
