/**
 * `PreviewWidget` — dispatch shell choosing the right per-node preview
 * widget based on the cached row's `outputKind`.
 *
 * **Where it renders changed in item 9 (2026-08-08).** It used to mount
 * INLINE in every node card, which is what made pressing Try reflow the graph:
 * a card grew by up to `PREVIEW_MAX_HEIGHT_PX` into dagre's 60px `nodesep`,
 * twice. It now renders inside the popover behind `NodeResultStrip` — a
 * fixed-height band on the card — so the widget itself is unchanged but the
 * card's height no longer depends on it. `NodePreviewOverlay` (below) still
 * owns the mount and still resolves `workflowId` + `activeRunId` from
 * `RunStateContext`; it just mounts the strip instead of this widget.
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
 *   - docs-md/workflows/TRY_IN_PLACE_DESIGN.md §4.1 + §4.6
 */

import { Alert, Box, Chip, Group, Skeleton, Text } from "@mantine/core";
import { type ReactNode, useState } from "react";

import type { NodeRunStatusValue } from "../run/node-status.types";
import { useOptionalRunState } from "../run/RunStateContext";
import { CacheEvictedAlert } from "./CacheEvictedAlert";
import { IdleNodeResultStrip, NodeResultStrip } from "./NodeResultStrip";
import { NoOutputNotice } from "./NoOutputNotice";
import {
  describeNoOutput,
  noOutputReasonForNode,
  type PreviewState,
} from "./no-output-state";
import type { PreviewOutputBinding } from "./preview.types";
import { renderKindValue } from "./render-kind-value";
import { selectPreviewOutput } from "./select-preview-output";
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
  /**
   * D-12 — true when this node's output is never cached at all (a dynamic node
   * whose script is `@deterministic:false`, surfaced by the catalog as
   * `nonCacheable`). Without it a green run reported "cache evicted — re-run to
   * repopulate", blaming a TTL that never applied and offering a recovery that
   * cannot work.
   */
  neverCached?: boolean;
  /**
   * D-18a — true only for `dyn.*` nodes. Splits the never-cached copy: a
   * dynamic node's author can tag the script `@deterministic true`; the author
   * of a built-in `nonCacheable` activity cannot, and must not be told to.
   */
  isDynamicNode?: boolean;
  /**
   * Item 9 — the selected port, when the CALLER owns it. `NodeResultStrip`
   * summarises one port on the card and opens this widget showing the same
   * one, so the selection has to be shared; two independent `useState`s would
   * let the summary and the panel disagree. Omitted (the test-only direct
   * mount) falls back to internal state and behaves exactly as before.
   */
  selectedPort?: string | null;
  /** Companion to `selectedPort`. Ignored unless `selectedPort` is supplied. */
  onSelectPort?: (port: string) => void;
}

/**
 * Dispatch shell — switches on the cache row's `outputKind` and
 * renders the matching widget. Unknown kinds render nothing.
 *
 * Test-only callers can mount this directly; the production mount is inside
 * the popover of `<NodeResultStrip>`, which `<NodePreviewOverlay nodeId={…} />`
 * (below) puts on the card.
 */
export function PreviewWidget({
  workflowId,
  nodeId,
  runId,
  isReplay = false,
  outputs,
  nodeStatus,
  producesOutput = true,
  neverCached = false,
  isDynamicNode = false,
  selectedPort: controlledPort,
  onSelectPort,
}: PreviewWidgetProps): ReactNode {
  const { data, isLoading, error } = useActivityOutputPreview(
    workflowId,
    nodeId,
    runId,
  );
  // Which output port the author is looking at. `null` = "the first one",
  // which keeps the single-output case identical to before.
  const [ownPort, setOwnPort] = useState<string | null>(null);
  const selectedPort = controlledPort === undefined ? ownPort : controlledPort;
  const setSelectedPort =
    controlledPort === undefined ? setOwnPort : (onSelectPort ?? setOwnPort);
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
      neverCached,
    });
    const copy = describeNoOutput(reason, { isDynamicNode });

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

  // G-011: preview the SELECTED output, not `outputs[0]`. Shared with
  // `NodeResultStrip` so the card's one-line summary and this panel can never
  // resolve to different values.
  const { selected, value, kind } = selectPreviewOutput(
    previewOutputs,
    selectedPort,
    data,
  );

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
  /**
   * D-12 — true when this node's output is never cached at all (a dynamic node
   * whose script is `@deterministic:false`, surfaced by the catalog as
   * `nonCacheable`). Without it a green run reported "cache evicted — re-run to
   * repopulate", blaming a TTL that never applied and offering a recovery that
   * cannot work.
   */
  neverCached?: boolean;
  /**
   * D-18a — true only for `dyn.*` nodes. Splits the never-cached copy: a
   * dynamic node's author can tag the script `@deterministic true`; the author
   * of a built-in `nonCacheable` activity cannot, and must not be told to.
   */
  isDynamicNode?: boolean;
}

/**
 * Thin wrapper mounted at the bottom of every node renderer. Resolves
 * `workflowId` + `activeRunId` from `RunStateContext` and mounts the
 * fixed-height `<NodeResultStrip>`, whose popover renders `<PreviewWidget>`.
 * Soft-fails when no `<RunStateProvider>` is mounted (legacy unit tests) so
 * node-renderer tests don't need the context plumbing.
 *
 * **Item 9 — the height contract.** Whatever this returns must be the same
 * height before, during and after a run, because dagre laid the graph out
 * from `estimateNodeHeight` and cannot be re-run mid-Try. Two shapes satisfy
 * that and nothing else does:
 *
 *   - a strip (`producesOutput`), constant at
 *     `PREVIEW_STRIP_TOTAL_HEIGHT_PX` in every state including idle; or
 *   - nothing at all (control-flow nodes), constant at zero.
 *
 * Note the idle branch no longer returns `null`. It used to, which is why
 * pressing Try grew the card: the resting layout reserved nothing.
 */
export function NodePreviewOverlay({
  nodeId,
  outputs,
  producesOutput = true,
  neverCached = false,
  isDynamicNode = false,
}: NodePreviewOverlayProps): ReactNode {
  const ctx = useOptionalRunState();
  // Control-flow nodes never write a cache row. Nothing to preview, no strip,
  // and — the part that matters here — zero height at rest and zero during a
  // run, so they cannot reflow either.
  if (!producesOutput) {
    return null;
  }
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
  // Idle: the strip is drawn (that is the reserved space) but NO query runs.
  // `useActivityOutputPreview` without a runId returns each node's most-recent
  // row from a PRIOR run, and showing that as current state is the thing the
  // old idle-suppression existed to prevent — the status badges suppress for
  // the same reason. `IdleNodeResultStrip` therefore calls no hook at all.
  if (!ctx.activeRunId) {
    return <IdleNodeResultStrip nodeId={nodeId} />;
  }
  return (
    <NodeResultStrip
      workflowId={ctx.workflowId}
      nodeId={nodeId}
      runId={ctx.activeRunId}
      isReplay={ctx.isReplay}
      outputs={outputs}
      nodeStatus={ctx.nodeStatuses[nodeId]?.status}
      producesOutput={producesOutput}
      neverCached={neverCached}
      isDynamicNode={isDynamicNode}
      renderDetail={({ selectedPort, onSelectPort }) => (
        <PreviewWidget
          workflowId={ctx.workflowId}
          nodeId={nodeId}
          runId={ctx.activeRunId ?? undefined}
          isReplay={ctx.isReplay}
          outputs={outputs}
          nodeStatus={ctx.nodeStatuses[nodeId]?.status}
          producesOutput={producesOutput}
          neverCached={neverCached}
          isDynamicNode={isDynamicNode}
          selectedPort={selectedPort}
          onSelectPort={onSelectPort}
        />
      )}
    />
  );
}
