import {
  getActivityCatalogEntry,
  isAssignable,
  type KindRef,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import { Divider, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMemo } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";

export interface ProducerSelection {
  producerNodeId: string;
  producerPort: string;
  /**
   * True when the producer sits on the canvas but is NOT upstream of the
   * consumer yet — picking it must also draw the execution edge
   * (UX walkthrough 2026-07-29: a compatible-but-unconnected
   * producer was invisible here, and the empty state gave no way forward).
   */
  needsEdge?: boolean;
}

interface ProducerPickerProps {
  config: GraphWorkflowConfig;
  consumerNodeId: string;
  expectedKind: KindRef;
  value: string;
  onChange: (selection: ProducerSelection | null) => void;
}

interface ProducerRow {
  nodeId: string;
  label: string;
  port: string;
  kind: KindRef;
  distance: number;
}

interface UnconnectedRow {
  nodeId: string;
  label: string;
  port: string;
  kind: KindRef;
}

export function ProducerPicker({
  config,
  consumerNodeId,
  expectedKind,
  onChange,
}: ProducerPickerProps) {
  const rows = useMemo<ProducerRow[]>(() => {
    const distances = upstreamNodesWithDistance(config, consumerNodeId);
    const list: ProducerRow[] = [];
    for (const [producerNodeId, distance] of distances) {
      const producer = config.nodes[producerNodeId];
      if (!producer) continue;
      if (producer.type !== "activity" && producer.type !== "pollUntil") {
        continue;
      }
      const activityType = producer.activityType;
      const entry = getActivityCatalogEntry(activityType);
      if (!entry) continue;
      for (const out of entry.outputs) {
        if (!out.kind) continue;
        if (!isAssignable(out.kind, expectedKind)) continue;
        list.push({
          nodeId: producerNodeId,
          label: producer.label || producerNodeId,
          port: out.name,
          kind: out.kind,
          distance,
        });
      }
    }
    list.sort((a, b) => a.distance - b.distance);
    return list;
  }, [config, consumerNodeId, expectedKind]);

  /**
   * UX walkthrough 2026-07-29 — compatible producers that ARE on the
   * canvas but not upstream (unconnected, or connected the other way).
   * Offering them here with a "connect it" pick beats a dead-end empty
   * state. Nodes the consumer already feeds (directly or transitively) are
   * excluded: wiring them back upstream would create a cycle.
   */
  const unconnected = useMemo<UnconnectedRow[]>(() => {
    const upstream = upstreamNodesWithDistance(config, consumerNodeId);
    const list: UnconnectedRow[] = [];
    for (const candidate of Object.values(config.nodes)) {
      if (candidate.id === consumerNodeId) continue;
      if (upstream.has(candidate.id)) continue;
      if (candidate.type !== "activity" && candidate.type !== "pollUntil") {
        continue;
      }
      const entry = getActivityCatalogEntry(candidate.activityType);
      if (!entry) continue;
      // Cycle guard: skip candidates that are downstream of the consumer.
      if (upstreamNodesWithDistance(config, candidate.id).has(consumerNodeId)) {
        continue;
      }
      for (const out of entry.outputs) {
        if (!out.kind) continue;
        if (!isAssignable(out.kind, expectedKind)) continue;
        list.push({
          nodeId: candidate.id,
          label: candidate.label || candidate.id,
          port: out.name,
          kind: out.kind,
        });
      }
    }
    return list;
  }, [config, consumerNodeId, expectedKind]);

  if (rows.length === 0 && unconnected.length === 0) {
    return (
      <Stack gap={6}>
        <Text size="xs" c="dimmed" data-testid="producer-picker-empty">
          No step in this workflow produces a {expectedKind} yet.
        </Text>
        <Text size="xs" c="dimmed">
          Sources come from connected steps: add a step whose output is a{" "}
          {expectedKind} and connect it so it runs before this one — it will
          wire up automatically, or appear here to pick.
        </Text>
      </Stack>
    );
  }
  return (
    <Stack gap={4}>
      {rows.length === 0 && (
        <Text size="xs" c="dimmed" data-testid="producer-picker-empty">
          Nothing connected before this step produces a {expectedKind} yet — but
          a step on this canvas does. Picking it will also connect it.
        </Text>
      )}
      {rows.map((r) => (
        <UnstyledButton
          key={`${r.nodeId}.${r.port}`}
          onClick={() =>
            onChange({ producerNodeId: r.nodeId, producerPort: r.port })
          }
          style={{
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid var(--mantine-color-default-border, #2c2e33)",
          }}
        >
          <Text size="xs" data-testid="producer-row-label">
            {r.label}
          </Text>
          <Text size="10px" c="dimmed">
            {r.port} · {r.kind} · {r.distance} step
            {r.distance === 1 ? "" : "s"} upstream
          </Text>
        </UnstyledButton>
      ))}
      {unconnected.length > 0 && (
        <>
          {rows.length > 0 && (
            <Divider
              label="On this canvas, not connected yet"
              labelPosition="left"
              my={2}
            />
          )}
          {unconnected.map((r) => (
            <UnstyledButton
              key={`unconnected-${r.nodeId}.${r.port}`}
              onClick={() =>
                onChange({
                  producerNodeId: r.nodeId,
                  producerPort: r.port,
                  needsEdge: true,
                })
              }
              data-testid={`producer-row-unconnected-${r.nodeId}`}
              style={{
                padding: "6px 8px",
                borderRadius: 4,
                border:
                  "1px dashed var(--mantine-color-default-border, #2c2e33)",
              }}
            >
              <Text size="xs" data-testid="producer-row-label">
                {r.label}
              </Text>
              <Text size="10px" c="dimmed">
                {r.port} · {r.kind} · not connected — picking connects it
              </Text>
            </UnstyledButton>
          ))}
        </>
      )}
    </Stack>
  );
}
