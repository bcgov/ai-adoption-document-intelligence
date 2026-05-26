/**
 * Combined input → output type pill, rendered below the selected node.
 *
 * - Single-port both sides → inline row `<inputKind> → <outputKind>`.
 * - Multi-port (either side >1) → vertical stack `in:portName: KIND` /
 *   `out:portName: KIND`.
 * - All ports untyped → renders nothing.
 *
 * Kind colours reuse `ARTIFACT_REGISTRY` via the same helpers `NodeTypePill`
 * already used, so the visual treatment is consistent with prior pills.
 */

import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";
import { Badge, Group, Stack } from "@mantine/core";
import type React from "react";
import type { NodeTypePillEntry } from "./NodeTypePill";

export interface NodeTypePillRowProps {
  inputs: NodeTypePillEntry[];
  outputs: NodeTypePillEntry[];
}

function elementKindOf(kind: KindRef): string {
  return kind.endsWith("[]") ? kind.slice(0, -2) : kind;
}

function colorForKind(kind: KindRef | undefined): string {
  if (kind === undefined) return "gray";
  const meta = getArtifactKindMeta(elementKindOf(kind));
  return meta?.color ?? "gray";
}

export function NodeTypePillRow({
  inputs,
  outputs,
}: NodeTypePillRowProps): React.ReactElement | null {
  const typedInputs = inputs.filter((e) => e.kind !== undefined);
  const typedOutputs = outputs.filter((e) => e.kind !== undefined);
  if (typedInputs.length === 0 && typedOutputs.length === 0) return null;

  const useStacked = inputs.length > 1 || outputs.length > 1;

  if (useStacked) {
    return (
      <Stack
        gap={2}
        data-testid="node-type-pill-row"
        data-shape="stacked"
        data-pill-anchor="under"
      >
        {inputs.map((entry) => {
          const labelKind: KindRef = entry.kind ?? "Artifact";
          const color = colorForKind(entry.kind);
          return (
            <Badge
              key={`in-${entry.portName}`}
              color={color}
              size="sm"
              variant="light"
              data-pill-direction="input"
              data-pill-port={entry.portName}
              data-pill-kind={labelKind}
              data-pill-color={color}
            >
              {`in:${entry.portName}: ${labelKind}`}
            </Badge>
          );
        })}
        {outputs.map((entry) => {
          const labelKind: KindRef = entry.kind ?? "Artifact";
          const color = colorForKind(entry.kind);
          return (
            <Badge
              key={`out-${entry.portName}`}
              color={color}
              size="sm"
              variant="light"
              data-pill-direction="output"
              data-pill-port={entry.portName}
              data-pill-kind={labelKind}
              data-pill-color={color}
            >
              {`out:${entry.portName}: ${labelKind}`}
            </Badge>
          );
        })}
      </Stack>
    );
  }

  // Arrow row. One side may be empty (only inputs OR only outputs typed).
  const inputColor =
    typedInputs.length === 1 ? colorForKind(typedInputs[0].kind) : "gray";
  const outputColor =
    typedOutputs.length === 1 ? colorForKind(typedOutputs[0].kind) : "gray";

  const inputBadge =
    typedInputs.length === 1 ? (
      <Badge
        color={inputColor}
        size="sm"
        variant="light"
        data-pill-direction="input"
        data-pill-port={typedInputs[0].portName}
        data-pill-kind={typedInputs[0].kind}
        data-pill-color={inputColor}
      >
        {(typedInputs[0].kind ?? "Artifact").toUpperCase()}
      </Badge>
    ) : null;

  const outputBadge =
    typedOutputs.length === 1 ? (
      <Badge
        color={outputColor}
        size="sm"
        variant="light"
        data-pill-direction="output"
        data-pill-port={typedOutputs[0].portName}
        data-pill-kind={typedOutputs[0].kind}
        data-pill-color={outputColor}
      >
        {(typedOutputs[0].kind ?? "Artifact").toUpperCase()}
      </Badge>
    ) : null;

  const showArrow = inputBadge !== null && outputBadge !== null;

  return (
    <Group
      gap={6}
      wrap="nowrap"
      data-testid="node-type-pill-row"
      data-shape="arrow"
      data-pill-anchor="under"
    >
      {inputBadge}
      {showArrow ? (
        <span
          data-testid="pill-row-arrow"
          aria-hidden
          style={{
            fontSize: 12,
            color: "var(--mantine-color-dimmed, #9ca3af)",
          }}
        >
          →
        </span>
      ) : null}
      {outputBadge}
    </Group>
  );
}
