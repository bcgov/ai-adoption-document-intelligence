import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";
import {
  forwardRef,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Image as KonvaImage, Layer, Stage } from "react-konva";
import { Box } from "../../../../ui";
import { BoundingBox, CanvasTool } from "../types";
import { BoundingBoxLayer } from "./BoundingBoxLayer";
import { DrawingLayer } from "./DrawingLayer";
import { useCanvasPan } from "./hooks/useCanvasPan";
import { useCanvasSelection } from "./hooks/useCanvasSelection";

export interface AnnotationCanvasHandle {
  panTo: (centerX: number, centerY: number, targetZoom: number) => void;
  /**
   * Returns the auto-fit base scale (effectiveScale = fitScale × userZoom).
   * Callers that need to compute a userZoom from a target effective scale
   * (e.g. zoom-to-fit-text logic) need this to invert the relationship.
   */
  getFitScale: () => number;
  /** Returns the canvas container's pixel size — useful for fit/cap calcs. */
  getCanvasSize: () => { width: number; height: number };
}

interface AnnotationCanvasProps {
  imageUrl?: string;
  width: number;
  height: number;
  boxes?: Array<{
    id: string;
    box: BoundingBox;
    label?: string;
    color?: string;
    confidence?: number;
  }>;
  activeTool?: CanvasTool;
  onBoxSelect?: (boxId: string | null) => void;
  onBoxCreate?: (box: BoundingBox) => void;
  onBoxHover?: (info: { boxId: string; x: number; y: number } | null) => void;
  rotation?: number;
  /** Vertical position when the image is smaller than the canvas (default: center). */
  verticalAlign?: "top" | "center";
  /** Fraction of container used when fitting (1 = edge-to-edge). Default 0.95. */
  fitPadding?: number;
  /**
   * Identifies the currently-active box, controlled by the parent. Used to
   * position the optional overlay (renderActiveBoxOverlay) right below
   * the corresponding bounding box.
   */
  activeBoxId?: string | null;
  /**
   * Render-prop for an HTML overlay anchored beneath the active box. The
   * `screenRect` is in container-relative pixels and already incorporates
   * the Stage's pan and zoom. Use it for inline edit widgets so the
   * reviewer can see input + bounding box at the same time.
   */
  renderActiveBoxOverlay?: (params: {
    boxId: string;
    screenRect: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  }) => ReactNode;
  /**
   * When true, the BoundingBoxLayer (boxes, labels) is suppressed. The
   * active-box overlay (renderActiveBoxOverlay) still renders so callers
   * can keep inline editing while hiding canvas chrome.
   */
  hideBoxes?: boolean;
}

export const AnnotationCanvas = forwardRef<
  AnnotationCanvasHandle,
  AnnotationCanvasProps
>(
  (
    {
      imageUrl,
      width,
      height,
      boxes = [],
      activeTool = CanvasTool.SELECT,
      onBoxSelect,
      onBoxCreate,
      onBoxHover,
      rotation = 0,
      verticalAlign = "center",
      fitPadding = 0.95,
      activeBoxId,
      renderActiveBoxOverlay,
      hideBoxes,
    },
    ref,
  ) => {
    const stageRef = useRef<Konva.Stage | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [imageSize, setImageSize] = useState<{
      width: number;
      height: number;
    } | null>(null);
    const [userZoom, setUserZoom] = useState(1); // User's zoom adjustment (1 = fit to container)

    const { pan, setPan } = useCanvasPan();
    const {
      selectedBoxId,
      hoveredBoxId,
      drawingBox,
      isDrawing,
      selectBox,
      hoverBox,
      startDrawing,
      updateDrawing,
      endDrawing,
    } = useCanvasSelection();

    // Determine effective dimensions based on rotation
    const effectiveDimensions = useMemo(() => {
      if (!imageSize) return null;
      // For 90° and 270° rotation, width and height are swapped
      if (rotation === 90 || rotation === 270) {
        return { width: imageSize.height, height: imageSize.width };
      }
      return { width: imageSize.width, height: imageSize.height };
    }, [imageSize, rotation]);

    // Calculate fit scale to make content fit in container
    const fitScale = useMemo(() => {
      if (!effectiveDimensions || width <= 0 || height <= 0) return 1;
      const scaleX = width / effectiveDimensions.width;
      const scaleY = height / effectiveDimensions.height;
      return Math.min(scaleX, scaleY) * fitPadding;
    }, [width, height, effectiveDimensions, fitPadding]);

    // Combined scale = fitScale * userZoom
    const effectiveScale = fitScale * userZoom;
    const isPanEnabled = useMemo(
      () =>
        Boolean(imageSize) &&
        effectiveScale > fitScale &&
        activeTool !== CanvasTool.DRAW_BOX,
      [activeTool, effectiveScale, fitScale, imageSize],
    );

    const clamp = useCallback((value: number, min: number, max: number) => {
      return Math.max(min, Math.min(max, value));
    }, []);

    const clampPan = useCallback(
      (nextPan: { x: number; y: number }, scale: number) => {
        if (!effectiveDimensions || width <= 0 || height <= 0)
          return { x: 0, y: 0 };

        const scaledWidth = effectiveDimensions.width * scale;
        const scaledHeight = effectiveDimensions.height * scale;

        const minX = Math.min(0, width - scaledWidth);
        const minY = Math.min(0, height - scaledHeight);
        const maxX = 0;
        const maxY = 0;

        const x =
          scaledWidth < width
            ? (width - scaledWidth) / 2
            : clamp(nextPan.x, minX, maxX);
        const y =
          scaledHeight < height
            ? verticalAlign === "top"
              ? 0
              : (height - scaledHeight) / 2
            : clamp(nextPan.y, minY, maxY);

        return { x, y };
      },
      [clamp, effectiveDimensions, verticalAlign, width, height],
    );

    useImperativeHandle(
      ref,
      () => ({
        panTo: (centerX: number, centerY: number, targetZoom: number) => {
          const newScale = fitScale * targetZoom;
          const newPanX = width / 2 - centerX * newScale;
          const newPanY = height / 2 - centerY * newScale;
          const clamped = clampPan({ x: newPanX, y: newPanY }, newScale);

          const stage = stageRef.current;
          if (stage) {
            new Konva.Tween({
              node: stage,
              duration: 0.2,
              x: clamped.x,
              y: clamped.y,
              scaleX: newScale,
              scaleY: newScale,
              easing: Konva.Easings.EaseInOut,
              onFinish: () => {
                setPan(clamped);
                setUserZoom(targetZoom);
              },
            }).play();
          }
        },
        getFitScale: () => fitScale,
        getCanvasSize: () => ({ width, height }),
      }),
      [fitScale, width, height, clampPan, setPan],
    );

    // Load image and get its natural dimensions
    useEffect(() => {
      if (imageUrl) {
        const img = new window.Image();
        img.src = imageUrl;
        img.onload = () => {
          imageRef.current = img;
          setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
          stageRef.current?.batchDraw();
        };
      }
    }, [imageUrl]);

    useEffect(() => {
      if (!imageSize || width <= 0 || height <= 0) return;
      const nextPan = clampPan(pan, effectiveScale);
      if (nextPan.x !== pan.x || nextPan.y !== pan.y) {
        setPan(nextPan);
      }
    }, [clampPan, effectiveScale, imageSize, width, height, pan, setPan]);

    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const scaleBy = 1.1;
      const newUserZoom =
        e.evt.deltaY < 0 ? userZoom * scaleBy : userZoom / scaleBy;
      // Clamp user zoom between 0.5x and 5x of fit scale
      const clampedZoom = Math.max(0.5, Math.min(5, newUserZoom));
      setUserZoom(clampedZoom);
    };

    const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // We intentionally do NOT deselect on mouseDown — that runs the
      // deselect before the user has a chance to drag-pan, clearing
      // their selection mid-drag. Deselection lives on the Stage's click
      // handler (handleStageClick), which Konva only fires when the user
      // pressed and released without dragging.
      if (e.target === e.target.getStage()) {
        // If we're in DRAW_BOX mode, start drawing
        if (activeTool === CanvasTool.DRAW_BOX) {
          const relativePos = {
            x: (pos.x - pan.x) / effectiveScale,
            y: (pos.y - pan.y) / effectiveScale,
          };
          startDrawing(relativePos);
        }
      }
    };

    const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (activeTool === CanvasTool.DRAW_BOX && isDrawing) {
        const relativePos = {
          x: (pos.x - pan.x) / effectiveScale,
          y: (pos.y - pan.y) / effectiveScale,
        };
        updateDrawing(relativePos);
      }
    };

    const handleMouseUp = () => {
      if (activeTool === CanvasTool.DRAW_BOX && isDrawing) {
        const newBox = endDrawing();
        if (newBox) {
          onBoxCreate?.(newBox);
        }
      }
    };

    const handleBoxClick = (boxId: string) => {
      if (activeTool === CanvasTool.SELECT) {
        selectBox(boxId);
        onBoxSelect?.(boxId);
      }
    };

    const forceDefaultCursor = useCallback(
      (event: KonvaEventObject<MouseEvent>) => {
        event.target
          .getStage()
          ?.container()
          .style.setProperty("cursor", "default");
      },
      [],
    );

    /**
     * Deselect on click outside any box. Konva's Stage onClick fires only
     * on a real click (mousedown + mouseup without enough movement to be
     * classified as a drag), so a drag-pan keeps the current selection.
     */
    const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) {
        selectBox(null);
        onBoxSelect?.(null);
      }
    };

    // Compute container-relative screen rect for the active box so the
    // overlay (if any) can be positioned directly beneath it.
    const activeOverlayPlacement = useMemo(() => {
      if (!activeBoxId || !renderActiveBoxOverlay) return null;
      const target = boxes.find((b) => b.id === activeBoxId);
      if (!target) return null;
      const points = target.box.polygon;
      if (!points || points.length === 0) return null;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxY)
      )
        return null;
      return {
        boxId: target.id,
        screenRect: {
          left: minX * effectiveScale + pan.x,
          top: maxY * effectiveScale + pan.y,
          width: (maxX - minX) * effectiveScale,
          height: (maxY - minY) * effectiveScale,
        },
      };
    }, [activeBoxId, renderActiveBoxOverlay, boxes, effectiveScale, pan]);

    return (
      <Box
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          cursor: "default",
          position: "relative",
        }}
      >
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          scaleX={effectiveScale}
          scaleY={effectiveScale}
          x={pan.x}
          y={pan.y}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleStageClick}
          onMouseEnter={forceDefaultCursor}
          onMouseLeave={forceDefaultCursor}
          draggable={isPanEnabled}
          dragBoundFunc={(newPos) => clampPan(newPos, effectiveScale)}
          onDragMove={(event) =>
            setPan(clampPan(event.target.position(), effectiveScale))
          }
          onDragStart={forceDefaultCursor}
          onDragEnd={(event) => {
            forceDefaultCursor(event);
            const nextPan = clampPan(event.target.position(), effectiveScale);
            setPan(nextPan);
          }}
        >
          {imageRef.current && imageSize && (
            <Layer
              listening={false}
              rotation={rotation}
              offsetX={imageSize.width / 2}
              offsetY={imageSize.height / 2}
              x={imageSize.width / 2}
              y={imageSize.height / 2}
            >
              <KonvaImage image={imageRef.current} listening={false} />
            </Layer>
          )}

          {!hideBoxes && (
            <BoundingBoxLayer
              boxes={boxes}
              selectedBoxId={selectedBoxId}
              hoveredBoxId={hoveredBoxId}
              onBoxClick={handleBoxClick}
              onBoxMouseEnter={(id) => {
                hoverBox(id);
                if (onBoxHover && stageRef.current) {
                  const pointer = stageRef.current.getPointerPosition();
                  if (pointer) {
                    onBoxHover({ boxId: id, x: pointer.x, y: pointer.y });
                  }
                }
              }}
              onBoxMouseLeave={() => {
                hoverBox(null);
                onBoxHover?.(null);
              }}
              rotation={rotation}
              offsetX={imageSize ? imageSize.width / 2 : 0}
              offsetY={imageSize ? imageSize.height / 2 : 0}
              x={imageSize ? imageSize.width / 2 : 0}
              y={imageSize ? imageSize.height / 2 : 0}
            />
          )}

          <DrawingLayer
            drawingBox={drawingBox}
            rotation={rotation}
            offsetX={imageSize ? imageSize.width / 2 : 0}
            offsetY={imageSize ? imageSize.height / 2 : 0}
            x={imageSize ? imageSize.width / 2 : 0}
            y={imageSize ? imageSize.height / 2 : 0}
          />
        </Stage>
        {activeOverlayPlacement && renderActiveBoxOverlay && (
          <div
            style={{
              position: "absolute",
              left: activeOverlayPlacement.screenRect.left,
              top: activeOverlayPlacement.screenRect.top,
              minWidth: activeOverlayPlacement.screenRect.width,
              pointerEvents: "auto",
              zIndex: 10,
            }}
            // Prevent canvas pan/drag handlers (which sit on the Stage) from
            // hijacking text-input mouse events inside the overlay.
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {renderActiveBoxOverlay(activeOverlayPlacement)}
          </div>
        )}
      </Box>
    );
  },
);

AnnotationCanvas.displayName = "AnnotationCanvas";
