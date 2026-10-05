import { useCallback, useMemo, useState } from "react";
import type { ExtractedFields } from "../../shared/types";
import { Paper, Text } from "../../ui";
import { DocumentCanvas } from "./DocumentCanvas";

interface DocumentViewerProps {
  imageUrl: string;
  extractedFields?: ExtractedFields;
  pageNumber?: number;
  showOverlays?: boolean;
  onToggleOverlays?: () => void;
  rotation?: number;
}

function getFieldDisplayValue(field: ExtractedFields[string]): string {
  if (field.valueSelectionMark !== undefined) {
    return field.valueSelectionMark === "selected"
      ? "☑ Selected"
      : "☐ Unselected";
  }
  if (field.valueNumber !== undefined) {
    return field.valueNumber.toString();
  }
  if (field.valueDate !== undefined) {
    return field.valueDate;
  }
  if (field.valueString !== undefined) {
    return field.valueString;
  }
  return field.content || "—";
}

export function DocumentViewer({
  imageUrl,
  extractedFields,
  pageNumber = 1,
  showOverlays = true,
  rotation = 0,
}: DocumentViewerProps) {
  /** API may send null; default `{}` does not apply when null is passed explicitly. */
  const fields = extractedFields ?? {};

  const boxes = useMemo(() => {
    if (!showOverlays) return [];
    return Object.entries(fields)
      .filter(([, field]) => {
        const br = field.boundingRegions?.find(
          (r) => r.pageNumber === pageNumber,
        );
        return br?.polygon && br.polygon.length >= 8;
      })
      .map(([fieldName, field]) => {
        const br = field.boundingRegions!.find(
          (r) => r.pageNumber === pageNumber,
        )!;
        const color =
          field.confidence >= 0.9
            ? "rgba(34, 197, 94, 1)"
            : field.confidence >= 0.7
              ? "rgba(251, 191, 36, 1)"
              : "rgba(239, 68, 68, 1)";
        return {
          id: fieldName,
          polygon: br.polygon,
          label: fieldName,
          color,
          confidence: field.confidence,
        };
      });
  }, [fields, pageNumber, showOverlays]);

  const [tooltip, setTooltip] = useState<{
    fieldName: string;
    x: number;
    y: number;
  } | null>(null);

  const handleBoxHover = useCallback(
    (info: { boxId: string; x: number; y: number } | null) => {
      setTooltip(info ? { fieldName: info.boxId, x: info.x, y: info.y } : null);
    },
    [],
  );

  const tooltipField = tooltip ? fields[tooltip.fieldName] : undefined;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <DocumentCanvas
        imageUrl={imageUrl || null}
        pageNumber={pageNumber}
        boxes={boxes}
        onBoxHover={handleBoxHover}
        rotation={rotation}
      />

      {tooltip && tooltipField && (
        <Paper
          shadow="md"
          p="xs"
          radius="sm"
          withBorder
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            pointerEvents: "none",
            zIndex: 100,
            maxWidth: 300,
          }}
        >
          <Text size="sm" fw={700} mb={2}>
            {tooltip.fieldName}
          </Text>
          <Text size="sm" mb={2}>
            {getFieldDisplayValue(tooltipField)}
          </Text>
          <Text size="xs" c="dimmed">
            Type: {tooltipField.type}
          </Text>
          <Text
            size="xs"
            c={
              tooltipField.confidence >= 0.9
                ? "green"
                : tooltipField.confidence >= 0.7
                  ? "yellow"
                  : "red"
            }
          >
            Confidence: {Math.round(tooltipField.confidence * 100)}%
          </Text>
        </Paper>
      )}
    </div>
  );
}
