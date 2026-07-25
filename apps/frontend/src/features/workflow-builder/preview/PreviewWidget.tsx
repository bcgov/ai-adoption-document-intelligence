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
import { Alert, Box, Chip, Group, Skeleton, Text } from "@mantine/core";
import { type ReactNode, useState } from "react";

import type { NodeRunStatusValue } from "../run/node-status.types";
import { useOptionalRunState } from "../run/RunStateContext";
import { CacheEvictedAlert } from "./CacheEvictedAlert";
import { NoOutputNotice } from "./NoOutputNotice";
import {
  describeNoOutput,
  noOutputReasonForNode,
  type PreviewState,
} from "./no-output-state";
import type { PreviewOutputBinding } from "./preview.types";
import { renderKindValue } from "./render-kind-value";
import { useActivityOutputPreview } from "./useActivityOutputPreview";

/**
 * Max height of the preview pane (px). Constrains every widget so the
 * canvas stays readable; widgets handle their own internal scroll /
 * pagination (§4 design doc).
 */
export const PREVIEW_MAX_HEIGHT_PX = 200;

/** Stable identity so the default never re-triggers memoised children. */
const EMPTY_OUTPUTS: readonly PreviewOutputBinding[] = [];

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
   * Every previewable output of the node, in declaration order (G-011). Each
   * carries the ctx key the value lives under inside the nested `outputCtx`
   * delta, plus the port's catalog label + kind. Supplied by the mounting
   * renderer, which has the node's output bindings. The widget previews the
   * first by default and renders a port selector when there is more than one.
   * Empty → nothing to read.
   */
  outputs?: readonly PreviewOutputBinding[];
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
  outputs,
  nodeStatus,
  producesOutput = true,
}: PreviewWidgetProps): ReactNode {
  const { data, isLoading, error } = useActivityOutputPreview(
    workflowId,
    nodeId,
    runId,
  );
  // Which output port the author is looking at. `null` = "the first one",
  // which keeps the single-output case identical to before.
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const previewOutputs = outputs ?? EMPTY_OUTPUTS;

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

  // G-011: preview the SELECTED output, not `outputs[0]`. `data.outputKind`
  // types only the first port (the worker's cache decorator records
  // `entry.outputs[0].kind`), so it is used as the kind only for that port;
  // later ports rely on their own catalog descriptor, and fall through to the
  // generic renderer when they have none.
  const selected =
    previewOutputs.find((o) => o.port === selectedPort) ?? previewOutputs[0];
  const value =
    selected !== undefined
      ? // `outputCtx` is stored NESTED at runtime (the engine splits the ctxKey
        // on "." and namespace-remaps prefixes). `resolveCtxBinding` performs
        // the identical read the engine resolver uses, so flat, `__auto.*` and
        // namespaced keys all resolve.
        resolveCtxBinding(selected.ctxKey, data.outputCtx)
      : undefined;
  const kind =
    selected?.kind ??
    (selected !== undefined && selected === previewOutputs[0]
      ? data.outputKind
      : null);

  return (
    <Box
      data-testid={`preview-widget-${nodeId}`}
      data-state={"ready" satisfies PreviewState}
      data-output-kind={kind ?? ""}
      data-output-port={selected?.port ?? ""}
      style={{ maxHeight: PREVIEW_MAX_HEIGHT_PX, overflow: "auto" }}
    >
      {previewOutputs.length > 1 && (
        <Group gap={4} mb={4} data-testid={`preview-output-selector-${nodeId}`}>
          {previewOutputs.map((output) => (
            <Chip
              key={output.port}
              size="xs"
              checked={output.port === selected?.port}
              onChange={() => setSelectedPort(output.port)}
              data-testid={`preview-output-chip-${output.port}`}
            >
              {output.label}
            </Chip>
          ))}
        </Group>
      )}
      {selected === undefined ? (
        <Text size="xs" c="dimmed" data-testid="preview-no-output-binding">
          This step's output isn't bound to a workflow value yet, so there's
          nothing to read.
        </Text>
      ) : (
        renderKindValue(kind, value, data.blobExcerpts)
      )}
    </Box>
  );
}

export interface NodePreviewOverlayProps {
  nodeId: string;
  /**
   * Every previewable output of the node (G-011) — see
   * `computePreviewOutputs`. The mounting renderer resolves them from the
   * node's own output bindings + catalog entry (it holds the node data; the
   * overlay only knows the id). Empty → nothing to read.
   */
  outputs?: readonly PreviewOutputBinding[];
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
  outputs,
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
      outputs={outputs}
      nodeStatus={ctx.nodeStatuses[nodeId]?.status}
      producesOutput={producesOutput}
    />
  );
}
