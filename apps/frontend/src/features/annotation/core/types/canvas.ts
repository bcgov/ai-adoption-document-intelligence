export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  polygon: Point[];
}

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CanvasState {
  transform: CanvasTransform;
  selectedBoxId: string | null;
  hoveredBoxId: string | null;
  isDragging: boolean;
  isPanning: boolean;
  isDrawing: boolean;
}

export interface DrawingBox {
  id: string;
  startPoint: Point;
  currentPoint: Point;
  isComplete: boolean;
}

export enum SelectionMode {
  CLICK = "click",
  BOX = "box",
  DRAW = "draw",
}

export enum CanvasTool {
  SELECT = "select",
  PAN = "pan",
  DRAW_BOX = "draw_box",
  ZOOM_IN = "zoom_in",
  ZOOM_OUT = "zoom_out",
}

export interface CanvasConfig {
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
  defaultZoom: number;
  panSpeed: number;
  selectionColor: string;
  highlightColor: string;
  drawingColor: string;
}

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  minZoom: 0.1,
  maxZoom: 5,
  zoomStep: 0.1,
  defaultZoom: 1,
  panSpeed: 1,
  selectionColor: "#228be6",
  highlightColor: "#fab005",
  drawingColor: "#40c057",
};
