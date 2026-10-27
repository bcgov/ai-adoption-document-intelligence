/**
 * KindDot — small coloured dot prefix for a typed-I/O `KindRef`.
 *
 * Used across library + canvas signature summaries (US-100) to give each
 * port a quick visual cue keyed to its family in `ARTIFACT_REGISTRY`. Array
 * kinds (e.g. `"Document[]"`) reuse the base kind's colour — cardinality is
 * communicated by adjacent text, not by the dot.
 *
 * It carries the family's SHAPE as well as its colour (item 20), for the same
 * reason the canvas handles do: this dot appears in lists where several kinds
 * sit one under another, which is exactly where two hues that a dichromat
 * cannot separate do the most damage.
 *
 * Renders nothing (returns `null`) when `kind` is `undefined`. Legacy
 * ports or wildcard-`Artifact` declarations therefore show no dot at all,
 * matching Scenario 3.
 */

import type { KindRef } from "@ai-di/graph-workflow";
import { Box } from "@mantine/core";
import type { ReactElement } from "react";

import {
  colorForKind,
  portDotColor,
  shapeForColor,
} from "../canvas/artifact-kind-colour";
import { portShapeStyle } from "../canvas/handle-style";

export interface KindDotProps {
  kind: KindRef | undefined;
  /** Diameter in pixels. Defaults to 8 — matches the Mantine xs badge dot. */
  size?: number;
}

export function KindDot({ kind, size = 8 }: KindDotProps): ReactElement | null {
  if (kind === undefined) return null;
  const color = colorForKind(kind);
  const shape = shapeForColor(color);
  return (
    <Box
      component="span"
      data-kind-dot={kind}
      data-kind-color={color}
      data-kind-shape={shape}
      style={{
        display: "inline-block",
        background: portDotColor(color),
        ...portShapeStyle(shape, { color, size }),
        marginRight: 6,
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}
