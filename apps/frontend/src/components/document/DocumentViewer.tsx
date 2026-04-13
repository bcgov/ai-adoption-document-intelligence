import { useElementSize } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
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

  // If PDF rendering worked, use it; otherwise fall back to the raw URL
  const [canvasImageUrl, setCanvasImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (pdfPageImageUrl) {
      setCanvasImageUrl(pdfPageImageUrl);
    } else if (imageUrl && numPages === 0) {
      // pdfjs couldn't parse it — use raw image URL
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
        />
      )}
    </div>
  );
}
