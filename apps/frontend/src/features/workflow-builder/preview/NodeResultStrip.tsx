/**
 * `NodeResultStrip` — the one-line, **fixed-height** result band on a node
 * card, and the popover that holds the full preview behind it.
 *
 * UX walkthrough 2026-08-06, item 9. Alex, watching a Try on the shared
 * screen: *"when you hit try, it also resized the boxes and they started to
 * overlap in a strange way … it's kind of jarring."* The cause was
 * arithmetic, not styling — `NodePreviewOverlay` mounted the full
 * `PreviewWidget` INLINE in the card body, so a card grew by up to
 * `PREVIEW_MAX_HEIGHT_PX` (200px) into dagre's 60px `nodesep`, and grew twice:
 * once for the 120px loading skeleton, again when real content replaced it.
 *
 * Option C (ruled 2026-08-08) fixes it by making the card's height *constant*:
 *
 *   - Every card that can produce output carries this strip at ALL times,
 *     including before a run — "Not run yet" — so pressing Try changes what
 *     the strip says and never how tall it is.
 *   - The strip is exactly `PREVIEW_STRIP_HEIGHT_PX` tall in every state. The
 *     loading state is a skeleton *inside* that height, not a 120px block.
 *   - The full, scrollable preview moves into a popover opened by clicking the
 *     strip. It renders the same `PreviewWidget` off the same shared batch
 *     query, so opening it costs no extra request.
 *
 * The cost, stated plainly: during a run you see *that* each node produced
 * something and roughly what, rather than every node's whole payload at once.
 * That was the accepted trade — see
 * `feature-docs/20260806-inderdeep-ux-review-batch-four/DECISIONS/09-try-reflow.md`.
 *
 * **Control-flow nodes get no strip at all.** They pass `producesOutput=false`
 * and have nothing to preview; a row of identical "doesn't produce output"
 * bands would paper the canvas. Rendering nothing is still constant height,
 * so it satisfies the same acceptance line ("no node overlaps another as a
 * result of pressing Try").
 */

import {
  Box,
  Group,
  Popover,
  Skeleton,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import type { NodeRunStatusValue } from "../run/node-status.types";
import { NoOutputNotice } from "./NoOutputNotice";
import {
  describeNoOutput,
  noOutputReasonForNode,
  type PreviewState,
} from "./no-output-state";
import type { PreviewOutputBinding } from "./preview.types";
import { selectPreviewOutput } from "./select-preview-output";
import {
  PREVIEW_STRIP_HEIGHT_PX,
  PREVIEW_STRIP_MARGIN_TOP_PX,
} from "./strip-metrics";
import { summarizeValueLine } from "./summarize-output";
import { useActivityOutputPreview } from "./useActivityOutputPreview";

export {
  PREVIEW_STRIP_HEIGHT_PX,
  PREVIEW_STRIP_MARGIN_TOP_PX,
  PREVIEW_STRIP_TOTAL_HEIGHT_PX,
} from "./strip-metrics";

/** Widest the popover gets before its own content scrolls. */
const DETAIL_POPOVER_WIDTH = 340;

/** Stable identity so the default never re-triggers memoised children. */
const EMPTY_OUTPUTS: readonly PreviewOutputBinding[] = [];

/**
 * Arguments handed to the popover body. `selectedPort` is owned by the STRIP,
 * not by the widget inside the popover: the strip summarises one port and the
 * popover shows the same one, so a port picked in the popover has to move the
 * summary too. Two independent `useState`s would let them disagree.
 */
export interface ResultDetailArgs {
  selectedPort: string | null;
  onSelectPort: (port: string) => void;
}

export interface NodeResultStripProps {
  workflowId: string;
  nodeId: string;
  /** Temporal execution id of the active run; `undefined` when idle. */
  runId?: string;
  /** True only when a PAST run is being replayed (not a live Try). */
  isReplay?: boolean;
  outputs?: readonly PreviewOutputBinding[];
  nodeStatus?: NodeRunStatusValue;
  producesOutput?: boolean;
  neverCached?: boolean;
  isDynamicNode?: boolean;
  /**
   * The full preview, rendered into the popover on demand. Passed in rather
   * than imported so this module does not depend on `PreviewWidget.tsx`, which
   * depends on this one.
   */
  renderDetail: (args: ResultDetailArgs) => ReactNode;
}

/** Text colour for a state's tone. Neutral is expected; notable is a fact. */
function toneColor(tone: "neutral" | "notable" | "silent"): string {
  return tone === "notable"
    ? "var(--mantine-color-orange-7, #f08c00)"
    : "var(--mantine-color-dimmed, #868e96)";
}

/**
 * The strip's chrome. Every state renders through this, which is what
 * guarantees they are all the same height — a state that built its own
 * wrapper could quietly reintroduce the reflow.
 */
function StripShell({
  nodeId,
  state,
  children,
  detail,
  ariaLabel,
}: {
  nodeId: string;
  state: PreviewState;
  children: ReactNode;
  detail: ReactNode;
  ariaLabel: string;
}): ReactNode {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom"
      shadow="md"
      width={DETAIL_POPOVER_WIDTH}
      withinPortal
      withArrow
      closeOnClickOutside
      // The React Flow pane calls `stopImmediatePropagation` on mousedown
      // (d3-zoom), so mousedown alone never reaches the document — the same
      // reason `WorkflowSwitcher` lists `click` here.
      clickOutsideEvents={["mousedown", "touchstart", "click"]}
      closeOnEscape
    >
      <Popover.Target>
        <UnstyledButton
          // `nodrag`/`nopan` keep a click on the strip from dragging the node
          // or panning the canvas — xyflow reads these class names directly.
          className="nodrag nopan"
          data-testid={`node-result-strip-${nodeId}`}
          data-state={state}
          aria-label={ariaLabel}
          aria-expanded={opened}
          onClick={(event) => {
            event.stopPropagation();
            setOpened((o) => !o);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          style={{
            display: "block",
            width: "100%",
            height: PREVIEW_STRIP_HEIGHT_PX,
            marginTop: PREVIEW_STRIP_MARGIN_TOP_PX,
            padding: "0 6px",
            borderRadius: 4,
            border: "1px solid var(--mantine-color-gray-3, #dee2e6)",
            background: "var(--mantine-color-gray-0, #f8f9fa)",
            overflow: "hidden",
          }}
        >
          <Group
            gap={6}
            wrap="nowrap"
            h={PREVIEW_STRIP_HEIGHT_PX}
            style={{ overflow: "hidden" }}
          >
            <Box style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              {children}
            </Box>
            <IconChevronRight
              size={12}
              aria-hidden
              style={{
                flexShrink: 0,
                color: "var(--mantine-color-dimmed, #868e96)",
              }}
            />
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        p="xs"
        className="nodrag nopan"
        data-testid={`node-result-detail-${nodeId}`}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {detail}
      </Popover.Dropdown>
    </Popover>
  );
}

/** One line of text clipped to the strip, never wrapped. */
function StripLine({
  color,
  children,
  testid,
}: {
  color: string;
  children: ReactNode;
  testid: string;
}): ReactNode {
  return (
    <Text
      size="xs"
      lineClamp={1}
      c={color}
      data-testid={testid}
      style={{ lineHeight: `${PREVIEW_STRIP_HEIGHT_PX}px` }}
    >
      {children}
    </Text>
  );
}

/**
 * The strip before any run is selected. Deliberately a SEPARATE component
 * with no query: `useActivityOutputPreview` with no `runId` fetches each
 * node's most-recent row from a PRIOR run, which the canvas has always
 * suppressed at rest (the status badges do the same) because showing last
 * week's output as current state is worse than showing nothing.
 */
export function IdleNodeResultStrip({ nodeId }: { nodeId: string }): ReactNode {
  const copy = describeNoOutput("no-run");
  return (
    <StripShell
      nodeId={nodeId}
      state="no-run"
      ariaLabel={`Output: ${copy.label}. Open details.`}
      detail={<NoOutputNotice reason="no-run" />}
    >
      <StripLine color={toneColor(copy.tone)} testid={`strip-label-${nodeId}`}>
        {copy.label}
      </StripLine>
    </StripShell>
  );
}

/**
 * The strip during a live Try or a replay. Reads the same shared batch query
 * the popover's `PreviewWidget` reads, so the two are one round-trip.
 */
export function NodeResultStrip({
  workflowId,
  nodeId,
  runId,
  isReplay = false,
  outputs,
  nodeStatus,
  producesOutput = true,
  neverCached = false,
  isDynamicNode = false,
  renderDetail,
}: NodeResultStripProps): ReactNode {
  const { data, isLoading, error } = useActivityOutputPreview(
    workflowId,
    nodeId,
    runId,
  );
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const previewOutputs = outputs ?? EMPTY_OUTPUTS;
  const detail = renderDetail({ selectedPort, onSelectPort: setSelectedPort });

  // A node that writes no cache row draws no strip, in EVERY state — checked
  // here and not only in the `data === null` branch below, which the loading
  // and error branches reach first. `NodePreviewOverlay` short-circuits this
  // already, so today the guard is belt-and-braces; without it the invariant
  // this component's docblock promises would live in its caller instead, and a
  // control-flow node mounted directly would render a 30px strip while the
  // query was in flight and collapse to nothing after — the exact reflow item
  // 9 exists to remove. Placed after the hooks so their order stays fixed.
  if (!producesOutput) return null;

  if (isLoading) {
    return (
      <StripShell
        nodeId={nodeId}
        state="loading"
        ariaLabel="Output: loading. Open details."
        detail={detail}
      >
        {/*
         * A skeleton sized to the strip, NOT the 120px block the inline widget
         * used — that block was half of the reflow (the card grew for the
         * skeleton, then again for the content).
         */}
        <Skeleton h={10} w="60%" radius="sm" mt={7} />
      </StripShell>
    );
  }

  if (error) {
    return (
      <StripShell
        nodeId={nodeId}
        state="error"
        ariaLabel="Output: preview unavailable. Open details."
        detail={detail}
      >
        <StripLine
          color="var(--mantine-color-red-7, #e03131)"
          testid={`strip-label-${nodeId}`}
        >
          Preview unavailable
        </StripLine>
      </StripShell>
    );
  }

  if (data === null) {
    const hasRun = runId !== undefined && runId !== "";
    const reason = noOutputReasonForNode({
      status: nodeStatus,
      runFinished: isReplay && hasRun,
      producesOutput,
      hasActiveRun: hasRun,
      neverCached,
    });
    const copy = describeNoOutput(reason, { isDynamicNode });
    // `silent` is control flow: nothing to say, and a band saying so on every
    // switch/map/join would be noise. Nothing rendered is still a CONSTANT
    // height, so the no-reflow guarantee holds.
    if (copy.tone === "silent") return null;
    return (
      <StripShell
        nodeId={nodeId}
        state={reason}
        ariaLabel={`Output: ${copy.label}. Open details.`}
        detail={detail}
      >
        <StripLine
          color={toneColor(copy.tone)}
          testid={`strip-label-${nodeId}`}
        >
          {copy.label}
        </StripLine>
      </StripShell>
    );
  }

  const { selected, value, kind } = selectPreviewOutput(
    previewOutputs,
    selectedPort,
    data,
  );

  if (selected === undefined) {
    return (
      <StripShell
        nodeId={nodeId}
        state="empty"
        ariaLabel="Output: not bound to a workflow value. Open details."
        detail={detail}
      >
        <StripLine
          color={toneColor("neutral")}
          testid={`strip-label-${nodeId}`}
        >
          Not bound to a value
        </StripLine>
      </StripShell>
    );
  }

  const summary = summarizeValueLine(value, data.blobExcerpts);

  return (
    <StripShell
      nodeId={nodeId}
      state="ready"
      ariaLabel={`Output ${selected.label}: ${summary}. Open the full value.`}
      detail={detail}
    >
      <Group gap={6} wrap="nowrap" style={{ overflow: "hidden" }}>
        {/*
         * The kind is what makes a ragged one-liner readable — Alex's ruling
         * was "show the first line of the value", and a first line is much
         * easier to read once you know whether it is a Document or a
         * Classification. Suppressed when nothing declares a kind rather than
         * printing an empty pill.
         */}
        {kind !== null && kind !== "" && (
          <Text
            size="xs"
            fw={600}
            c="dimmed"
            data-testid={`strip-kind-${nodeId}`}
            style={{
              flexShrink: 0,
              lineHeight: `${PREVIEW_STRIP_HEIGHT_PX}px`,
            }}
          >
            {previewOutputs.length > 1 ? `${selected.label} · ${kind}` : kind}
          </Text>
        )}
        <StripLine
          color="var(--mantine-color-text, #212529)"
          testid={`strip-summary-${nodeId}`}
        >
          {summary}
        </StripLine>
      </Group>
    </StripShell>
  );
}
