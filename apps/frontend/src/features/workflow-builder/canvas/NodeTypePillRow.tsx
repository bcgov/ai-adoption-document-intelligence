/**
 * Combined input → output type pill, rendered below the selected node.
 *
 * - Single-port both sides → inline row `<inputKind> → <outputKind>`.
 * - Multi-port (either side >1) → vertical stack `in:portName: KIND` /
 *   `out:portName: KIND`.
 * - All ports untyped → renders nothing.
 *
 * The component owns its absolutely-positioned under-node wrapper so
 * callers don't leak an empty wrapper `<div>` when every port is
 * untyped. Kind colours reuse `ARTIFACT_REGISTRY` via the shared
 * helpers in `artifact-kind-colour.ts`.
 */

import type { KindRef } from "@ai-di/graph-workflow";
import { Badge, Group, Stack } from "@mantine/core";
import type React from "react";
import { colorForKind } from "./artifact-kind-colour";
import type { NodeTypePillEntry } from "./NodeTypePill";

export interface NodeTypePillRowProps {
  inputs: NodeTypePillEntry[];
  outputs: NodeTypePillEntry[];
}

/**
 * Wrap a shape (stacked or arrow) in the absolutely-positioned
 * under-anchor container. Centralising the wrapper here means the
 * `data-pill-anchor="under"` marker only exists when the row has
 * something to render.
 */
function wrap(child: React.ReactElement): React.ReactElement {
  return (
    <div
      data-pill-anchor="under"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {child}
    </div>
  );
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
    return wrap(
      <Stack gap={2} data-testid="node-type-pill-row" data-shape="stacked">
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
      </Stack>,
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

  return wrap(
    <Group
      gap={6}
      wrap="nowrap"
      data-testid="node-type-pill-row"
      data-shape="arrow"
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
    </Group>,
  );
}
