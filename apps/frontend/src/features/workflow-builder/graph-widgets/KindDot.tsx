/**
 * KindDot — small coloured dot prefix for a typed-I/O `KindRef`.
 *
 * Used across library + canvas signature summaries (US-100) to give each
 * port a quick visual cue keyed to `ARTIFACT_REGISTRY[kind].color` (the
 * Mantine palette name). Array kinds (e.g. `"Document[]"`) reuse the base
 * kind's colour — cardinality is communicated by adjacent text, not by
 * the dot.
 *
 * Renders nothing (returns `null`) when `kind` is `undefined`. Legacy
 * ports or wildcard-`Artifact` declarations therefore show no dot at all,
 * matching Scenario 3.
 */

import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";
import { Box } from "@mantine/core";
import type { ReactElement } from "react";

export interface KindDotProps {
  kind: KindRef | undefined;
  /** Diameter in pixels. Defaults to 8 — matches the Mantine xs badge dot. */
  size?: number;
}

export function KindDot({ kind, size = 8 }: KindDotProps): ReactElement | null {
  if (kind === undefined) return null;
  // Strip the `[]` cardinality marker so the registry lookup hits the base
  // kind. Array kinds share their element's colour by design.
  const elementKind = kind.endsWith("[]") ? kind.slice(0, -2) : kind;
  const meta = getArtifactKindMeta(elementKind);
  const color = meta?.color ?? "gray";
  return (
    <Box
      component="span"
      data-kind-dot={kind}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `var(--mantine-color-${color}-6)`,
        marginRight: 6,
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}
