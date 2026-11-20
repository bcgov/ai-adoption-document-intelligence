import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnnotationCanvas,
  type AnnotationCanvasHandle,
} from "../../features/annotation/core/canvas/AnnotationCanvas";
import {
  RENDER_SCALE,
  usePdfPageImage,
} from "../../features/annotation/core/canvas/hooks/usePdfPageImage";
import type { CanvasTool } from "../../features/annotation/core/types/canvas";
import { Stack, Text, useElementSize } from "../../ui";

/** Box in OCR coordinate space: flat [x0, y0, x1, y1, ...] in inches for PDFs. */
export interface DocumentCanvasBox {
  id: string;
  polygon: number[];
  label?: string;
  color: string;
  confidence?: number;
  isActive?: boolean;
}

export interface DocumentCanvasHandle {
  focusBox: (boxId: string) => void;
}

interface DocumentCanvasProps {
  imageUrl: string | null;
  pageNumber?: number;
  boxes?: DocumentCanvasBox[];
  onBoxSelect?: (boxId: string | null) => void;
  onBoxHover?: (info: { boxId: string; x: number; y: number } | null) => void;
  rotation?: number;
  activeTool?: CanvasTool;
  verticalAlign?: "top" | "center";
  fitPadding?: number;
}

const FOCUS_ZOOM = 5;
export const PIXELS_PER_INCH = RENDER_SCALE * 72;

export const DocumentCanvas = forwardRef<
  DocumentCanvasHandle,
  DocumentCanvasProps
>(
  (
    {
      imageUrl,
      pageNumber = 1,
      boxes = [],
      onBoxSelect,
      onBoxHover,
      rotation = 0,
      activeTool,
      verticalAlign,
      fitPadding,
    },
    ref,
  ) => {
    const { ref: containerRef, width, height } = useElementSize();
    const innerCanvasRef = useRef<AnnotationCanvasHandle>(null);

    const { imageUrl: pdfPageImageUrl, numPages } = usePdfPageImage(
      imageUrl,
      pageNumber,
    );
    const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(
      null,
    );

    useEffect(() => {
      if (pdfPageImageUrl) {
        setResolvedImageUrl(pdfPageImageUrl);
      } else if (imageUrl && numPages === 0) {
        // Wait briefly so PDF rendering can start before falling back to raw URL
        const timer = setTimeout(() => setResolvedImageUrl(imageUrl), 500);
        return () => clearTimeout(timer);
      } else {
        setResolvedImageUrl(null);
      }
    }, [pdfPageImageUrl, imageUrl, numPages]);

    const scale = numPages > 0 ? PIXELS_PER_INCH : 1;

    const scaledBoxes = useMemo(
      () =>
        boxes.map(({ id, polygon, label, color, confidence, isActive }) => {
          const points: Array<{ x: number; y: number }> = [];
          for (let i = 0; i + 1 < polygon.length; i += 2) {
            points.push({
              x: polygon[i] * scale,
              y: polygon[i + 1] * scale,
            });
          }
          return {
            id,
            box: { polygon: points },
            label,
            color,
            confidence,
            isActive,
          };
        }),
      [boxes, scale],
    );

    useImperativeHandle(
      ref,
      () => ({
        focusBox(boxId: string) {
          const box = scaledBoxes.find((b) => b.id === boxId);
          if (!box?.box.polygon.length) return;
          const xs = box.box.polygon.map((p) => p.x);
          const ys = box.box.polygon.map((p) => p.y);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          innerCanvasRef.current?.panTo(cx, cy, FOCUS_ZOOM);
        },
      }),
      [scaledBoxes],
    );

    return (
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      >
        {width > 0 && height > 0 && resolvedImageUrl ? (
          <AnnotationCanvas
            ref={innerCanvasRef}
            imageUrl={resolvedImageUrl}
            width={width}
            height={height}
            boxes={scaledBoxes}
            activeTool={activeTool}
            onBoxSelect={onBoxSelect}
            onBoxHover={onBoxHover}
            rotation={rotation}
            verticalAlign={verticalAlign}
            fitPadding={fitPadding}
          />
        ) : (
          <Stack align="center" justify="center" style={{ height: "100%" }}>
            <Text size="sm" c="dimmed">
              {imageUrl
                ? "Loading document..."
                : "Document preview is unavailable."}
            </Text>
          </Stack>
        )}
      </div>
    );
  },
);
DocumentCanvas.displayName = "DocumentCanvas";
