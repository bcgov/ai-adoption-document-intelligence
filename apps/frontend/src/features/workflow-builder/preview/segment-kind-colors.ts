/**
 * `segment-kind-colors` — per-segment-kind palette helper for the
 * `SegmentArrayPreview` widget (US-143).
 *
 * The palette is the same 7-kind colour mapping called out in
 * `feature-docs/.../user_stories/US-143-segment-array-preview.md`
 * Scenario 2 (the "Phase 3 §1" segment-kind palette):
 *
 *   | kind       | Mantine colour |
 *   |------------|----------------|
 *   | Text       | gray           |
 *   | Table      | blue           |
 *   | Figure     | violet         |
 *   | Form       | green          |
 *   | KeyValue   | yellow (amber) |
 *   | Signature  | pink           |
 *   | Header     | teal           |
 *
 * Phase 3's `ARTIFACT_REGISTRY` colours the `Segment` *Artifact* (one
 * colour for the whole kind family) — this map colours the
 * *sub-classification* of each segment for the overlay UI. They're
 * distinct concerns; keeping this helper local avoids overloading the
 * shared registry.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L36
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-143-segment-array-preview.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.3
 */

/**
 * The 7 known segment-kind classifications produced by the Phase 3 (and
 * Phase 5) segmentation activities. Unknown / future kinds fall back to
 * gray (same as `Text`) via {@link segmentKindColor}.
 */
export type SegmentKind =
  | "Text"
  | "Table"
  | "Figure"
  | "Form"
  | "KeyValue"
  | "Signature"
  | "Header";

/**
 * Mantine palette names (the lower-case base colour, the swatch number
 * is chosen at usage site per Mantine convention — `-6` for strokes,
 * `-1`/`-2` for fills).
 */
export type SegmentKindMantineColor =
  | "gray"
  | "blue"
  | "violet"
  | "green"
  | "yellow"
  | "pink"
  | "teal";

/** Canonical map. Frozen so consumers can't mutate it. */
export const SEGMENT_KIND_COLORS: Readonly<
  Record<SegmentKind, SegmentKindMantineColor>
> = Object.freeze({
  Text: "gray",
  Table: "blue",
  Figure: "violet",
  Form: "green",
  KeyValue: "yellow",
  Signature: "pink",
  Header: "teal",
});

/**
 * Map a segment's `kind` to a Mantine palette colour. Unknown / missing
 * kinds default to `gray` so the overlay still renders with a neutral
 * stroke instead of falling off the screen.
 */
export function segmentKindColor(
  kind: string | undefined,
): SegmentKindMantineColor {
  if (kind === undefined) {
    return "gray";
  }
  if (kind in SEGMENT_KIND_COLORS) {
    return SEGMENT_KIND_COLORS[kind as SegmentKind];
  }
  return "gray";
}

/**
 * Resolve a Mantine colour token to its `--mantine-color-<name>-<shade>`
 * CSS custom-property reference. Used by `SegmentArrayPreview` for both
 * SVG `stroke` (shade 6) and `fill` (shade 4 with reduced opacity).
 */
export function segmentKindCssVar(
  color: SegmentKindMantineColor,
  shade: number,
): string {
  return `var(--mantine-color-${color}-${shade})`;
}
