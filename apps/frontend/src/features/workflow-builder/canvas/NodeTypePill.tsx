/**
 * On-selection type pill rendered adjacent to a node's input/output
 * handles (US-096).
 *
 * Two surface shapes:
 *   - Single typed port → one Mantine `<Badge>` with the kind literal
 *     uppercased (e.g. `"SEGMENT[]"`), coloured by the kind's family
 *     palette entry from `ARTIFACT_REGISTRY`.
 *   - Multi-port → `<Stack>` of one-line `<Badge>` rows; every row reads
 *     `"<portName>: <kind>"` and gets its own family colour. `Artifact`
 *     wildcards and unknown kinds collapse to gray so colourblind users
 *     still get the text signal.
 *
 * Visibility rules:
 *   - `hidden === true` (e.g. node not selected) → renders nothing.
 *   - `entries.length === 0` (legacy un-fanned-out catalog entry) →
 *     renders nothing.
 *   - Every entry's `kind` is `undefined` (no typed signals at all) →
 *     renders nothing. Scenario 4 leans on this branch to keep the gray
 *     handle + multi-port tooltip from US-095 as the only kind signal.
 *
 * The pill text IS the screen-reader-visible content; no `aria-label`
 * is needed.
 */

import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";
import { Badge, Stack } from "@mantine/core";
import type React from "react";

export interface NodeTypePillEntry {
  /** Port name as declared in the activity catalog (e.g. `"segments"`). */
  portName: string;
  /**
   * Kind literal for the port (`"Segment[]"`, `"Document"`, …). Pass
   * `undefined` for legacy un-typed descriptors — those rows are
   * rendered as gray wildcards (`Artifact`) in the multi-port shape and
   * suppressed entirely from the single-port shape.
   */
  kind: KindRef | undefined;
}

export interface NodeTypePillProps {
  /** Ordered list of ports on one side of the node. */
  entries: NodeTypePillEntry[];
  /** Which side this pill is rendering for — drives the `data-pill-direction` marker. */
  direction: "input" | "output";
  /** When true the pill renders nothing (e.g. node deselected — Scenario 3). */
  hidden?: boolean;
}

/**
 * Strip a `T[]` suffix from a `KindRef`, returning the element kind so the
 * registry lookup resolves through the family root. `Segment[]` →
 * `Segment`. Non-array kinds pass through unchanged.
 */
function elementKindOf(kind: KindRef): string {
  return kind.endsWith("[]") ? kind.slice(0, -2) : kind;
}

/**
 * Resolve the Mantine palette colour for a kind via the live registry.
 * Falls back to gray for `Artifact` (the wildcard root) and for unknown
 * kinds.
 */
function colorForKind(kind: KindRef | undefined): string {
  if (kind === undefined) return "gray";
  const meta = getArtifactKindMeta(elementKindOf(kind));
  return meta?.color ?? "gray";
}

export function NodeTypePill({
  entries,
  direction,
  hidden,
}: NodeTypePillProps): React.ReactElement | null {
  if (hidden) return null;
  if (entries.length === 0) return null;
  const typedEntries = entries.filter((e) => e.kind !== undefined);
  if (typedEntries.length === 0) return null;

  if (entries.length === 1) {
    // Single declared port — render one badge. If the lone port is
    // untyped (kind undefined) we already returned above via the
    // `typedEntries.length === 0` guard.
    const entry = entries[0];
    const kind = entry.kind;
    if (kind === undefined) return null;
    return (
      <Badge
        color={colorForKind(kind)}
        size="sm"
        variant="light"
        data-testid={`node-type-pill-${direction}`}
        data-pill-direction={direction}
        data-pill-port={entry.portName}
        data-pill-color={colorForKind(kind)}
        data-pill-kind={kind}
      >
        {kind.toUpperCase()}
      </Badge>
    );
  }

  // Multi-port — vertical stack of `<portName>: <kind>` badges. Untyped
  // rows render as gray `Artifact` so the user still sees the port name
  // for documentation purposes.
  return (
    <Stack
      gap={2}
      data-testid={`node-type-pill-${direction}`}
      data-pill-direction={direction}
    >
      {entries.map((entry) => {
        const kind = entry.kind;
        const labelKind: KindRef = kind ?? "Artifact";
        const color = colorForKind(kind);
        return (
          <Badge
            key={entry.portName}
            color={color}
            size="sm"
            variant="light"
            data-pill-port={entry.portName}
            data-pill-color={color}
            data-pill-kind={labelKind}
          >
            {`${entry.portName}: ${labelKind}`}
          </Badge>
        );
      })}
    </Stack>
  );
}
