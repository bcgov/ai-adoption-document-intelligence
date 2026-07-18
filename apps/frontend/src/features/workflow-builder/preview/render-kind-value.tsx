import { getArtifactKindMeta } from "@ai-di/graph-workflow";
import type { ReactNode } from "react";

import { ClassificationPreview } from "./ClassificationPreview";
import { DocumentPreview } from "./DocumentPreview";
import { OcrResultPreview } from "./OcrResultPreview";
import { SegmentArrayPreview } from "./SegmentArrayPreview";

/**
 * Walks the live-registry `baseKind` chain to the family root (the
 * direct child of `Artifact`), so shape-honest subkinds retagged onto
 * catalog ports by the kind-taxonomy-refinement wave (`DocumentRef`,
 * `PreparedFile`, `DocumentContent`, `ClassificationLabel`,
 * `LabeledDocumentMap`, …) dispatch to their family's preview widget
 * instead of falling through to `null`.
 *
 * Uses `getArtifactKindMeta` (the LIVE registry), not the frozen
 * `ARTIFACT_REGISTRY`, so dynamically-registered kinds resolve too —
 * mirrors `canvas/handle-style.ts`'s pattern.
 *
 * Returns the input unchanged for unknown kinds (fail-safe → default
 * `null` widget).
 */
function familyRoot(kind: string): string {
  let current = kind;
  for (let i = 0; i < 16; i++) {
    const base = getArtifactKindMeta(current)?.baseKind;
    if (base === undefined || base === "Artifact") return current;
    current = base;
  }
  return current;
}

/**
 * Shared kind→widget dispatch. Given an artifact-kind literal and the
 * value that conforms to it, returns the matching value-level preview
 * widget, or `null` when no widget exists for that kind.
 *
 * Single source of truth for the mapping so the node-card preview
 * (`PreviewWidget.renderForOutputKind`, keyed on `outputKind` + a fixed
 * ctx slot) and the wire peek (`WirePeekPopover`, keyed on the wire's
 * `kind` + `outputCtx[ctxKey]`) can never drift.
 *
 * Dispatch is family-based: the kind is first resolved to its
 * `baseKind` family root (see `familyRoot`), so shape-honest subkinds
 * route to the same widget as their family.
 */
export function renderKindValue(
  kind: string | null,
  value: unknown,
): ReactNode | null {
  if (!kind) return null;
  const isArray = kind.endsWith("[]");
  const root = familyRoot(isArray ? kind.slice(0, -2) : kind);
  if (isArray) {
    return root === "Segment" ? <SegmentArrayPreview value={value} /> : null;
  }
  switch (root) {
    case "Document":
      return <DocumentPreview value={value} />;
    case "OcrResult":
      return <OcrResultPreview value={value} />;
    case "Classification":
      return <ClassificationPreview value={value} />;
    default:
      return null;
  }
}

export { familyRoot };
