import type { ReactNode } from "react";

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
 */
export function renderKindValue(
  kind: string | null,
  value: unknown,
): ReactNode | null {
  switch (kind) {
    case "Document":
    case "MultiPageDocument":
    case "SinglePageDocument":
      return <DocumentPreview value={value} />;
    case "Segment[]":
      return <SegmentArrayPreview value={value} />;
    case "OcrResult":
    case "OcrFields":
      return <OcrResultPreview value={value} />;
    case "Classification":
      return <ClassificationPreview value={value} />;
    default:
      return null;
  }
}
