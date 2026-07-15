/**
 * `WirePeekPopover` — the value-on-a-wire peek surface (Phase 4 "wire data
 * peek"). When a user clicks a data wire on the canvas after a run, this
 * popover shows the value that flowed across that wire — the producer
 * node's `outputCtx[ctxKey]` slot, rendered through the shared
 * `renderKindValue` dispatch (falling back to `JsonValuePreview`).
 *
 * Keyed on the wire's `source` node + `ctxKey`, it reads from the same
 * shared batch-preview query as the node-card `PreviewWidget` via
 * `useActivityOutputPreview`, so a peek costs no extra network round-trip.
 *
 * This component renders the popover body only; mounting it inside the
 * canvas edge + wiring the context-menu entry belong to later tasks.
 */

import { resolveCtxBinding } from "@ai-di/graph-workflow";
import { Alert, Paper, Skeleton, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

import { CacheEvictedAlert } from "../preview/CacheEvictedAlert";
import { JsonValuePreview } from "../preview/JsonValuePreview";
import { renderKindValue } from "../preview/render-kind-value";
import { useActivityOutputPreview } from "../preview/useActivityOutputPreview";
import { useOptionalRunState } from "../run/RunStateContext";
import type { DataWire } from "./derive-wires";

export interface WirePeekPopoverProps {
  wire: DataWire;
  producerLabel?: string;
  portLabel?: string;
}

/**
 * Shared Paper + header chrome so every state branch renders an identical
 * bordered, click-swallowing surface (clicks inside must not bubble to the
 * canvas). `data-state` distinguishes the branch for tests + styling.
 */
function Shell({
  state,
  header,
  children,
}: {
  state: string;
  header: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Paper
      data-testid="wire-peek-popover"
      data-state={state}
      shadow="md"
      p="xs"
      withBorder
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        pointerEvents: "all",
        maxWidth: 320,
        maxHeight: 260,
        overflow: "auto",
      }}
    >
      <Stack gap={4}>
        <Text size="xs" fw={600} c="dimmed">
          {header}
        </Text>
        {children}
      </Stack>
    </Paper>
  );
}

export function WirePeekPopover({
  wire,
  producerLabel,
  portLabel,
}: WirePeekPopoverProps): ReactNode {
  const runState = useOptionalRunState();
  const workflowId = runState?.workflowId ?? "";
  const activeRunId = runState?.activeRunId ?? null;
  const isReplay = runState?.isReplay ?? false;
  const header = `${producerLabel ?? wire.source} → ${portLabel ?? wire.sourcePort}`;

  // Called unconditionally (hooks rules) — the branches below only read its
  // result. `useActivityOutputPreview` self-disables when `workflowId` is
  // empty, so the no-run branch never fires a fetch.
  const { data, isLoading, error } = useActivityOutputPreview(
    workflowId,
    wire.source,
    activeRunId ?? undefined,
  );

  if (activeRunId === null || activeRunId === "") {
    return (
      <Shell state="no-run" header={header}>
        <Text size="xs" c="dimmed" data-testid="wire-peek-value">
          Run to see the data flowing here.
        </Text>
      </Shell>
    );
  }
  if (isLoading) {
    return (
      <Shell state="loading" header={header}>
        <Skeleton h={60} radius="sm" />
      </Shell>
    );
  }
  if (error) {
    return (
      <Shell state="error" header={header}>
        <Alert color="red" variant="light" data-testid="wire-peek-value">
          Preview unavailable
        </Alert>
      </Shell>
    );
  }
  if (data === null) {
    if (isReplay) {
      return (
        <Shell state="evicted" header={header}>
          <CacheEvictedAlert
            workflowId={workflowId}
            runId={activeRunId}
            nodeId={wire.source}
          />
        </Shell>
      );
    }
    return (
      <Shell state="no-run" header={header}>
        <Text size="xs" c="dimmed" data-testid="wire-peek-value">
          Run to see the data flowing here.
        </Text>
      </Shell>
    );
  }
  // `outputCtx` is stored NESTED at runtime: the engine splits the ctxKey
  // on "." into nested objects and namespace-remaps prefixes (`doc.*` →
  // `documentMetadata.*`). `resolveCtxBinding` performs the identical read
  // the engine resolver uses, so flat, `__auto.*`, and namespaced keys all
  // resolve. `undefined` is a sound "absent" signal — JSON leaves are never
  // `undefined`.
  const value = resolveCtxBinding(wire.ctxKey, data.outputCtx);
  if (value === undefined) {
    return (
      <Shell state="empty" header={header}>
        <Text size="xs" c="dimmed" data-testid="wire-peek-value">
          No value recorded for this connection.
        </Text>
      </Shell>
    );
  }

  const widget = renderKindValue(wire.kind ?? null, value);
  return (
    <Shell state="ready" header={header}>
      <div data-testid="wire-peek-value">
        {widget ?? <JsonValuePreview value={value} />}
      </div>
    </Shell>
  );
}
