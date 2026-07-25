/**
 * Connect-summary popover (PORT_WIRING_DESIGN.md §6.4).
 *
 * After a NODE-LEVEL connect (drag node-to-node, hover-extend pick, §6.1
 * fall-throughs), an edge is created and — on the page side —
 * `resolveBindings` runs inside `handleCanvasConfigChange`, silently
 * auto-filling the target's input bindings. Silent auto-wire is the single
 * biggest trust problem per §6.4: this transient popover narrates what
 * happened, anchored on the connection's target.
 *
 * Port-to-port drags (§6.1 both-port branch) do NOT get this popover — the
 * pinned wire itself is the feedback; the host only opens this for
 * node-level connects and hover-extend picks (see `WorkflowEditorCanvas`'s
 * `openConnectSummary`).
 *
 * Row semantics (population + resolution) are the exact same ones
 * `InputsSection` renders — both surfaces share `resolveWireableInputRows`
 * from `input-row-resolution.ts` so they can never drift.
 *
 * Anchor pattern mirrors `HoverExtendPopover`: a 1×1 invisible fixed-
 * position div is the Popover's target, rendered through Mantine's portal
 * so it escapes xyflow's scroll-clipped container.
 */
import { Button, Group, Popover, Stack, Text } from "@mantine/core";
import { useEffect, useRef } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  resolvePinnedSource,
  resolveWireableInputRows,
  type WireableInputRow,
} from "../settings/input-row-resolution";

const AUTO_DISMISS_MS = 8000;

export interface ConnectSummaryPopoverProps {
  opened: boolean;
  anchorPosition: { x: number; y: number };
  config: GraphWorkflowConfig;
  nodeId: string | null;
  onClose: () => void;
  /** Deep-link into the settings-panel source picker. */
  onFix?: (nodeId: string, port: string) => void;
}

export function ConnectSummaryPopover({
  opened,
  anchorPosition,
  config,
  nodeId,
  onClose,
  onFix,
}: ConnectSummaryPopoverProps) {
  // `onClose` held in a ref so its IDENTITY can never churn the dismiss
  // timer: the canvas passes an inline closure (`() => setConnectSummary(
  // null)`) — a new function on every canvas re-render (handle hover,
  // selection, drags, config changes) — and a timer effect keyed on
  // `onClose` would clear + re-arm the full 8s on each of those,
  // indefinitely deferring dismissal while the user interacts.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 8s auto-dismiss, armed when `opened` flips true and re-armed when the
  // popover retargets to a different node while already open (a second
  // connect within the window deliberately restarts the countdown for the
  // new summary). Cleared on close (opened flips false) or unmount so it
  // never fires against a stale callback.
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => onCloseRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [opened, nodeId]);

  // Reads the LIVE `config` prop — by the time this renders, the page's
  // `resolveBindings` pass (inside `handleCanvasConfigChange`) has already
  // run, so these rows reflect post-auto-wire truth, not the pre-connect
  // snapshot.
  const rows = nodeId ? resolveWireableInputRows(config, nodeId) : [];

  if (!opened || !nodeId || rows.length === 0) return null;

  return (
    <Popover
      opened
      onChange={(next) => {
        if (!next) onClose();
      }}
      position="right-start"
      withinPortal
      closeOnClickOutside
      closeOnEscape
      shadow="md"
      width={300}
      offset={4}
      // Skip the transition delay — under jsdom + fake timers a mounting
      // transition can otherwise sit unresolved forever. The popover is a
      // transient notice, not a flashy reveal, so an immediate open/close
      // matches the desired UX too (mirrors HoverExtendPopover).
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <div
          data-testid="connect-summary-anchor"
          style={{
            position: "fixed",
            left: `${anchorPosition.x}px`,
            top: `${anchorPosition.y}px`,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Popover.Target>
      <Popover.Dropdown data-testid="connect-summary-popover" p="xs">
        <Stack gap={6}>
          {rows.map((row) => (
            <SummaryRow
              key={row.port.name}
              row={row}
              config={config}
              nodeId={nodeId}
              onFix={onFix}
              onClose={onClose}
            />
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

interface SummaryRowProps {
  row: WireableInputRow;
  config: GraphWorkflowConfig;
  nodeId: string;
  onFix?: (nodeId: string, port: string) => void;
  onClose: () => void;
}

function SummaryRow({ row, config, nodeId, onFix, onClose }: SummaryRowProps) {
  const { port, resolution } = row;
  const testId = `connect-summary-row-${port.name}`;

  const fixButton = (
    <Button
      size="compact-xs"
      color="yellow"
      variant="light"
      data-testid={`connect-summary-fix-${port.name}`}
      onClick={() => {
        onFix?.(nodeId, port.name);
        onClose();
      }}
    >
      Fix
    </Button>
  );

  switch (resolution.status) {
    case "auto-bound": {
      const producerLabel =
        config.nodes[resolution.producerNodeId]?.label ??
        resolution.producerNodeId;
      return (
        <Group gap={6} wrap="nowrap" data-testid={testId}>
          <Text size="xs">
            ✓ {port.label} ← {producerLabel}
            {resolution.via === "name-match" ? " · matched by name" : ""}
          </Text>
        </Group>
      );
    }
    case "locked": {
      const source = resolvePinnedSource(config, resolution.ctxKey);
      const sourceText =
        source.via === "producer"
          ? `← ${source.label}`
          : `— from ${source.ctxKey}`;
      return (
        <Group gap={6} wrap="nowrap" data-testid={testId}>
          <Text size="xs">
            ✓ {port.label} {sourceText} · pinned by you
          </Text>
        </Group>
      );
    }
    case "ctx-bound":
      return (
        <Group gap={6} wrap="nowrap" data-testid={testId}>
          <Text size="xs">
            ✓ {port.label} — from {resolution.ctxKey}
          </Text>
        </Group>
      );
    case "unsatisfied":
      return (
        <Group
          gap={6}
          wrap="nowrap"
          justify="space-between"
          data-testid={testId}
        >
          <Text size="xs">⚠ {port.label} needs a source</Text>
          {fixButton}
        </Group>
      );
    case "ambiguous":
      return (
        <Group
          gap={6}
          wrap="nowrap"
          justify="space-between"
          data-testid={testId}
        >
          <Text size="xs">⚠ {port.label} — multiple possible sources</Text>
          {fixButton}
        </Group>
      );
    case "locked-dangling":
      return (
        <Group
          gap={6}
          wrap="nowrap"
          justify="space-between"
          data-testid={testId}
        >
          <Text size="xs">
            ⚠ {port.label} — pinned to {resolution.ctxKey}, which nothing writes
          </Text>
          {fixButton}
        </Group>
      );
    case "locked-kind-mismatch":
      return (
        <Group
          gap={6}
          wrap="nowrap"
          justify="space-between"
          data-testid={testId}
        >
          <Text size="xs">
            ⚠ {port.label} — pinned to {resolution.ctxKey} ({resolution.actual}
            ), expected {resolution.expected}
          </Text>
          {fixButton}
        </Group>
      );
    case "locked-unbound":
      return (
        <Group
          gap={6}
          wrap="nowrap"
          justify="space-between"
          data-testid={testId}
        >
          <Text size="xs">⚠ {port.label} — disconnected by you</Text>
          {fixButton}
        </Group>
      );
  }
}
