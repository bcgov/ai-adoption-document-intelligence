import {
  getActivityCatalogEntry,
  isAssignable,
  type KindRef,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import { Stack, Text, UnstyledButton } from "@mantine/core";
import { useMemo } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";

interface ProducerPickerProps {
  config: GraphWorkflowConfig;
  consumerNodeId: string;
  expectedKind: KindRef;
  value: string;
  onChange: (
    selection: { producerNodeId: string; producerPort: string } | null,
  ) => void;
}

interface ProducerRow {
  nodeId: string;
  label: string;
  port: string;
  kind: KindRef;
  distance: number;
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

  if (rows.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        No upstream producer emits a {expectedKind}. Add a step that produces
        one.
      </Text>
    );
  }
  return (
    <Stack gap={4}>
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
    </Stack>
  );
}
