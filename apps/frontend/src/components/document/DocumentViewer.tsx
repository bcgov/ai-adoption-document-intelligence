import { Paper, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnnotationCanvas } from "../../features/annotation/core/canvas/AnnotationCanvas";
import { usePdfPageImage } from "../../features/annotation/core/canvas/hooks/usePdfPageImage";
import type { ExtractedFields } from "../../shared/types";

interface DocumentViewerProps {
  imageUrl: string;
  extractedFields?: ExtractedFields;
  pageNumber?: number;
  showOverlays?: boolean;
  onToggleOverlays?: () => void;
}

const PIXELS_PER_INCH = 144;

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
  extractedFields = {},
  pageNumber = 1,
  showOverlays = true,
}: DocumentViewerProps) {
  const {
    ref: canvasRef,
    width: canvasWidth,
    height: canvasHeight,
  } = useElementSize();

  const { imageUrl: pdfPageImageUrl, numPages } = usePdfPageImage(
    imageUrl || null,
    pageNumber,
  );

  const [canvasImageUrl, setCanvasImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (pdfPageImageUrl) {
      setCanvasImageUrl(pdfPageImageUrl);
    } else if (imageUrl && numPages === 0) {
      const timer = setTimeout(() => setCanvasImageUrl(imageUrl), 500);
      return () => clearTimeout(timer);
    }
  }, [pdfPageImageUrl, imageUrl, numPages]);

  const isPdf = numPages > 0;

  const boxes = useMemo(() => {
    if (!showOverlays) return [];
    return Object.entries(extractedFields)
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
        const polygon = br.polygon;
        const points = [];
        for (let i = 0; i < polygon.length; i += 2) {
          points.push({
            x: polygon[i] * (isPdf ? PIXELS_PER_INCH : 1),
            y: polygon[i + 1] * (isPdf ? PIXELS_PER_INCH : 1),
          });
        }
        const color =
          field.confidence >= 0.9
            ? "rgba(34, 197, 94, 1)"
            : field.confidence >= 0.7
              ? "rgba(251, 191, 36, 1)"
              : "rgba(239, 68, 68, 1)";
        return {
          id: fieldName,
          box: { polygon: points },
          label: fieldName,
          color,
          confidence: field.confidence,
        };
      });
  }, [extractedFields, pageNumber, showOverlays, isPdf]);

  // Tooltip state — positioned relative to the canvas container
  const [tooltip, setTooltip] = useState<{
    fieldName: string;
    x: number;
    y: number;
  } | null>(null);

  const handleBoxHover = useCallback(
    (info: { boxId: string; x: number; y: number } | null) => {
      if (!info) {
        setTooltip(null);
        return;
      }
      setTooltip({ fieldName: info.boxId, x: info.x, y: info.y });
    },
    [],
  );

  const tooltipField = tooltip ? extractedFields[tooltip.fieldName] : undefined;

  return (
    <div
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {canvasWidth > 0 && canvasHeight > 0 && canvasImageUrl && (
        <AnnotationCanvas
          imageUrl={canvasImageUrl}
          width={canvasWidth}
          height={canvasHeight}
          boxes={boxes}
          onBoxHover={handleBoxHover}
        />
      )}

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
