/**
 * Step→port picker for the condition editor's Ref mode
 * (PORT_WIRING_DESIGN §11). Sibling to ProducerPicker, but applies NO kind
 * filter — a condition legitimately reads a scalar out of any output. Lists
 * one row per catalog output port of every upstream activity/pollUntil node,
 * nearest first. Purely presentational: emits the chosen producer node + port;
 * the caller materialises the binding and stores the ctx key.
 */
import {
  getActivityCatalogEntry,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import { Stack, Text, UnstyledButton } from "@mantine/core";
import { useMemo } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { producerCtxKey } from "./condition-producer-binding";

interface ConditionProducerPickerProps {
  config: GraphWorkflowConfig;
  /** The control-flow node the condition belongs to; scopes "upstream". */
  currentNodeId: string;
  /** Currently-stored ref, so the matching row renders selected. */
  value: string;
  onChange: (selection: {
    producerNodeId: string;
    producerPort: string;
  }) => void;
}

interface Row {
  nodeId: string;
  label: string;
  port: string;
  portLabel: string;
  kindLabel: string;
  distance: number;
  ctxKey: string;
}

export function ConditionProducerPicker({
  config,
  currentNodeId,
  value,
  onChange,
}: ConditionProducerPickerProps) {
  const rows = useMemo<Row[]>(() => {
    const distances = upstreamNodesWithDistance(config, currentNodeId);
    const list: Row[] = [];
    for (const [nodeId, distance] of distances) {
      const node = config.nodes[nodeId];
      if (!node) continue;
      if (node.type !== "activity" && node.type !== "pollUntil") continue;
      const entry = getActivityCatalogEntry(node.activityType);
      if (!entry) continue;
      for (const out of entry.outputs) {
        list.push({
          nodeId,
          label: node.label || nodeId,
          port: out.name,
          portLabel: out.label,
          kindLabel: out.kind ?? "any",
          distance,
          ctxKey: producerCtxKey(config, nodeId, out.name),
        });
      }
    }
    list.sort((a, b) => a.distance - b.distance);
    return list;
  }, [config, currentNodeId]);

  if (rows.length === 0) {
    return (
      <Text size="xs" c="dimmed" data-testid="condition-producer-empty">
        No upstream steps yet — add one, or enter a variable manually.
      </Text>
    );
  }

  // D22 — the list read as a bag of anonymous options. Naming what it is
  // costs two lines and removes the guess: every row below is one OUTPUT of
  // one STEP that already ran, which is the fact the row layout was leaving
  // the reader to infer from the arrow.
  return (
    <Stack gap={4} data-testid="condition-producer-picker">
      <Stack gap={0} data-testid="condition-producer-heading">
        <Text size="xs" fw={600}>
          Outputs of earlier steps
        </Text>
        <Text size="10px" c="dimmed">
          Each row is one output of a step that runs before this one — step
          name, then the output it produces.
        </Text>
      </Stack>
      {rows.map((r) => {
        const selected = r.ctxKey === value;
        return (
          <UnstyledButton
            key={`${r.nodeId}.${r.port}`}
            data-testid="condition-producer-row"
            data-selected={selected ? "true" : "false"}
            onClick={() =>
              onChange({ producerNodeId: r.nodeId, producerPort: r.port })
            }
            style={{
              padding: "6px 8px",
              borderRadius: 4,
              border: selected
                ? "1px solid var(--mantine-color-blue-5, #4dabf7)"
                : "1px solid var(--mantine-color-default-border, #2c2e33)",
            }}
          >
            <Text size="xs">
              {r.label} → {r.portLabel}
            </Text>
            <Text size="10px" c="dimmed">
              {r.port} · {r.kindLabel} · {r.distance} step
              {r.distance === 1 ? "" : "s"} upstream
            </Text>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
