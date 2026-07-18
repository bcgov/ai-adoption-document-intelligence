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

import { Alert, Box, Skeleton } from "@mantine/core";
import type { ReactNode } from "react";

import { useOptionalRunState } from "../run/RunStateContext";
import { CacheEvictedAlert } from "./CacheEvictedAlert";
import type { ActivityOutputPreview } from "./preview.types";
import { familyRoot, renderKindValue } from "./render-kind-value";
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
 * Pure dispatch — resolves `outputKind` to its `baseKind` family root
 * and forwards the appropriate ctx slot to the matching widget. Kept
 * as a separate helper so the widget stories (US-142 → US-145) can
 * drop in their components by replacing the corresponding `case` body
 * (or the widget file's body) without touching the loading / error
 * branches.
 *
 * Family-based (not exact-string) so shape-honest subkinds retagged
 * onto catalog ports by the kind-taxonomy-refinement wave (e.g.
 * `PreparedFile`, `DocumentRef`, `ClassificationLabel`,
 * `LabeledDocumentMap`) still resolve to the right ctx slot — mirrors
 * `render-kind-value.tsx`'s `familyRoot` resolution so this dispatch
 * and `renderKindValue`'s widget dispatch can never drift apart.
 *
 * The ctx-slot key per family mirrors the design doc's §4.1 example.
 */
function renderForOutputKind(data: ActivityOutputPreview): ReactNode {
  const { outputKind, outputCtx } = data;
  const slot = ((): unknown => {
    if (!outputKind) return undefined;
    const isArray = outputKind.endsWith("[]");
    const root = familyRoot(isArray ? outputKind.slice(0, -2) : outputKind);
    if (isArray) {
      return root === "Segment" ? outputCtx.segments : undefined;
    }
    switch (root) {
      case "Document":
        return outputCtx.document;
      case "OcrResult":
        return outputCtx.ocrResult;
      case "Classification":
        return outputCtx.classification;
      default:
        // null `outputKind` OR an unsupported family (`Segment`
        // singular, `ValidationResult`, `Reference`, `Artifact`, …).
        // `renderKindValue` returns null for these — Phase 4.x adds
        // further widgets to the shared dispatch.
        return undefined;
    }
  })();
  return renderKindValue(outputKind, slot);
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
      isReplay={ctx.isReplay}
    />
  );
}
