import { type KindRef, resolveKindFamilyRoot } from "@ai-di/graph-workflow";
import type { ReactNode } from "react";

import { splitKindRef } from "../canvas/artifact-kind-colour";
import { ClassificationPreview } from "./ClassificationPreview";
import { DocumentPreview } from "./DocumentPreview";
import { OcrResultPreview } from "./OcrResultPreview";
import { SegmentArrayPreview } from "./SegmentArrayPreview";

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
  const { baseKind, isArray } = splitKindRef(kind as KindRef);
  const root = resolveKindFamilyRoot(baseKind);
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
