/**
 * Pure helper for the workflow-builder "Kind" Select column (US-098 + US-099).
 *
 * Drives both:
 *   - `WorkflowSettingsDrawer` ctx-row Kind column
 *   - `LibraryPortListEditor` (`SaveAsLibraryModal`) port-row Kind column
 *
 * Builds a Mantine-`<Select>`-compatible grouped option shape from
 * `ARTIFACT_REGISTRY`. Every registry entry produces two Select items:
 * the base kind and its array variant. A top "Wildcard" group exposes
 * the "no kind selected" sentinel plus the literal `Artifact` kind.
 *
 * Family-grouping order matches `TYPED_IO_DESIGN.md` §1 — Document,
 * Segment, OCR, Classification + Validation, Reference — so the user
 * sees families in the same order they appear in the type hierarchy
 * declaration.
 */

import {
  ARTIFACT_REGISTRY,
  type ArtifactKind,
  type KindRef,
} from "@ai-di/graph-workflow";

/**
 * Sentinel value used by the Mantine `<Select>` to mean "no kind /
 * Artifact wildcard". Distinct from `undefined`/`null` because Mantine
 * `<Select>` cannot render an empty-string-valued item; using a unique
 * sentinel keeps the Select fully controlled.
 */
export const KIND_WILDCARD_VALUE = "__wildcard__";

export interface KindSelectItem {
  value: string;
  label: string;
}

export interface KindSelectGroup {
  group: string;
  items: KindSelectItem[];
}

/**
 * Family ordering used when grouping registry entries. The order here is
 * the order rendered in the Select dropdown.
 */
const FAMILY_ORDER = [
  "Wildcard",
  "Document",
  "Segment",
  "OCR",
  "Classification & Validation",
  "Reference",
] as const;

type FamilyName = (typeof FAMILY_ORDER)[number];

/**
 * Maps a registry entry to the user-facing family group it belongs to.
 * Walks the `baseKind` chain to classify so that nested kinds (e.g.
 * `MultiPageDocument` → `Document` → `Artifact`) bucket under the right
 * root family.
 */
function familyFor(kind: ArtifactKind): FamilyName {
  if (kind === "Artifact") return "Wildcard";

  // Walk up the baseKind chain to find the family root.
  let current: ArtifactKind | undefined = kind;
  while (current !== undefined) {
    if (current === "Document") return "Document";
    if (current === "Segment") return "Segment";
    if (current === "OcrResult") return "OCR";
    if (current === "Classification" || current === "ValidationResult") {
      return "Classification & Validation";
    }
    if (current === "Reference") return "Reference";
    current = ARTIFACT_REGISTRY[current].baseKind;
  }

  // Should be unreachable — every non-Artifact kind has a baseKind chain
  // terminating at one of the family roots above. Fall back to Wildcard so
  // a missing-family bug never silently drops the option.
  return "Wildcard";
}

/**
 * Build the grouped Select-option shape consumed by Mantine `<Select>`.
 *
 * Output ordering:
 *   1. "Wildcard" group — first option is the `KIND_WILDCARD_VALUE` "—"
 *      sentinel, followed by the literal `Artifact` + `Artifact[]` entries.
 *   2. Remaining families in `FAMILY_ORDER`. Within each family, base
 *      kinds appear in `ARTIFACT_REGISTRY` declaration order; each base
 *      kind is immediately followed by its array variant.
 */
export function buildKindSelectOptions(): KindSelectGroup[] {
  const buckets: Record<FamilyName, KindSelectItem[]> = {
    Wildcard: [{ value: KIND_WILDCARD_VALUE, label: "—" }],
    Document: [],
    Segment: [],
    OCR: [],
    "Classification & Validation": [],
    Reference: [],
  };

  for (const kind of Object.keys(ARTIFACT_REGISTRY) as ArtifactKind[]) {
    const meta = ARTIFACT_REGISTRY[kind];
    const family = familyFor(kind);
    buckets[family].push({ value: kind, label: meta.displayName });
    buckets[family].push({
      value: `${kind}[]`,
      label: `${meta.displayName} (array)`,
    });
  }

  return FAMILY_ORDER.filter((family) => buckets[family].length > 0).map(
    (family) => ({ group: family, items: buckets[family] }),
  );
}

/**
 * Convert a stored `KindRef | undefined` to the Select's controlled value.
 * `undefined` (no kind declared) maps to the wildcard sentinel so the
 * Select can render the "—" option.
 */
export function kindRefToSelectValue(kind: KindRef | undefined): string {
  return kind ?? KIND_WILDCARD_VALUE;
}

/**
 * Convert a Select value back to `KindRef | undefined` for persistence.
 * `null` (Mantine emits `null` when the user clears) and the wildcard
 * sentinel both map to `undefined` so the field is dropped at save time
 * (`kind?` is optional, not nullable — see TYPED_IO_DESIGN.md §5.1).
 */
export function selectValueToKindRef(
  value: string | null,
): KindRef | undefined {
  if (value === null || value === KIND_WILDCARD_VALUE) return undefined;
  return value as KindRef;
}
