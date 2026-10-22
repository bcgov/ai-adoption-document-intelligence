/**
 * Step→port picker for the condition editor's Ref mode
 * (PORT_WIRING_DESIGN §11). Sibling to ProducerPicker, but applies NO kind
 * filter — a condition legitimately reads a scalar out of any output. Lists
 * one row per catalog output port of every upstream activity/pollUntil node,
 * nearest first. A poll step's own condition also lists the step's own
 * outputs, first: the condition is checked after every attempt, against what
 * that attempt returned, so the step's own result is what it usually reads.
 * Purely presentational: emits the chosen producer node + port; the caller
 * materialises the binding and stores the ctx key.
 */
import {
  getActivityCatalogEntry,
  upstreamNodesWithDistance,
} from "@ai-di/graph-workflow";
import { Stack, Text, UnstyledButton } from "@mantine/core";
import { useMemo } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { resolveCtxKeyToProducer } from "./condition-producer-binding";

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
}

/** One row per catalog output port of `nodeId`, if it runs an activity. */
function outputRows(
  config: GraphWorkflowConfig,
  nodeId: string,
  distance: number,
): Row[] {
  const node = config.nodes[nodeId];
  if (!node) return [];
  if (node.type !== "activity" && node.type !== "pollUntil") return [];
  const entry = getActivityCatalogEntry(node.activityType);
  if (!entry) return [];
  return entry.outputs.map((out) => ({
    nodeId,
    label: node.label || nodeId,
    port: out.name,
    portLabel: out.label,
    kindLabel: out.kind ?? "any",
    distance,
  }));
}

export function ConditionProducerPicker({
  config,
  currentNodeId,
  value,
  onChange,
}: ConditionProducerPickerProps) {
  const ownRows = useMemo<Row[]>(
    () =>
      config.nodes[currentNodeId]?.type === "pollUntil"
        ? outputRows(config, currentNodeId, 0)
        : [],
    [config, currentNodeId],
  );
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const [nodeId, distance] of upstreamNodesWithDistance(
      config,
      currentNodeId,
    )) {
      list.push(...outputRows(config, nodeId, distance));
    }
    list.sort((a, b) => a.distance - b.distance);
    return list;
  }, [config, currentNodeId]);
  // Resolved the way the condition's own sentence resolves it, so a stored
  // `ctx.ocrStatus` and a picked `ocrStatus` select the same row, and a ref
  // into one field of an output selects that output.
  const selected = useMemo(
    () => resolveCtxKeyToProducer(config, value, currentNodeId),
    [config, value, currentNodeId],
  );

  if (rows.length === 0 && ownRows.length === 0) {
    return (
      <Text size="xs" c="dimmed" data-testid="condition-producer-empty">
        No upstream steps yet — add one, or enter a variable manually.
      </Text>
    );
  }

  const renderRow = (r: Row, where: string) => {
    const isSelected =
      selected !== null &&
      selected.producerNodeId === r.nodeId &&
      selected.port === r.port;
    return (
      <UnstyledButton
        key={`${r.nodeId}.${r.port}`}
        data-testid="condition-producer-row"
        data-selected={isSelected ? "true" : "false"}
        onClick={() =>
          onChange({ producerNodeId: r.nodeId, producerPort: r.port })
        }
        style={{
          padding: "6px 8px",
          borderRadius: 4,
          border: isSelected
            ? "1px solid var(--mantine-color-blue-5, #4dabf7)"
            : "1px solid var(--mantine-color-default-border, #2c2e33)",
        }}
      >
        <Text size="xs">
          {r.label} → {r.portLabel}
        </Text>
        <Text size="10px" c="dimmed">
          {r.port} · {r.kindLabel} · {where}
        </Text>
      </UnstyledButton>
    );
  };

  // Unlabelled, the list reads as a bag of anonymous options. Naming what it
  // is costs two lines and removes the guess: every row below is one OUTPUT of
  // one STEP, which the row layout alone leaves the reader to infer from the
  // arrow.
  return (
    <Stack gap={4} data-testid="condition-producer-picker">
      {ownRows.length > 0 && (
        <>
          <Stack gap={0} data-testid="condition-producer-own-heading">
            <Text size="xs" fw={600}>
              This step's result
            </Text>
            <Text size="10px" c="dimmed">
              The condition is checked after every attempt, against what that
              attempt returned.
            </Text>
          </Stack>
          {ownRows.map((r) => renderRow(r, "this step"))}
        </>
      )}
      {rows.length > 0 && (
        <>
          <Stack gap={0} data-testid="condition-producer-heading">
            <Text size="xs" fw={600}>
              Outputs of earlier steps
            </Text>
            <Text size="10px" c="dimmed">
              Each row is one output of a step that runs before this one — step
              name, then the output it produces.
            </Text>
          </Stack>
          {rows.map((r) =>
            renderRow(
              r,
              `${r.distance} step${r.distance === 1 ? "" : "s"} upstream`,
            ),
          )}
        </>
      )}
    </Stack>
  );
}
