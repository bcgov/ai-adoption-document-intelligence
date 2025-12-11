import { Button, Tooltip } from "@mantine/core";
import {
  IconEye,
  IconEyeOff,
  IconRotateClockwise,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { KeyValuePair } from "../../shared/types";

interface DocumentViewerProps {
  imageUrl: string;
  keyValuePairs?: KeyValuePair[];
  pageNumber?: number;
  onZoomChange?: (zoom: number) => void;
  showOverlays?: boolean;
  onToggleOverlays?: () => void;
}

export function DocumentViewer({
  imageUrl,
  keyValuePairs = [],
  pageNumber = 1,
  onZoomChange,
  showOverlays = true,
  onToggleOverlays,
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [imageDimensions, setImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onZoomChange) {
      onZoomChange(zoom);
    }
  }, [zoom, onZoomChange]);

  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
      setIsImageLoaded(true);
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const renderKeyValueOverlays = () => {
    if (
      !showOverlays ||
      !isImageLoaded ||
      !imageRef.current ||
      keyValuePairs.length === 0
    ) {
      return null;
    }

    const img = imageRef.current;
    const imgRect = img.getBoundingClientRect();

    return keyValuePairs
      .filter((kvp) =>
        kvp.key?.boundingRegions?.some((br) => br.pageNumber === pageNumber),
      )
      .map((kvp, index) => {
        // Use the bounding region for this page
        const boundingRegion = kvp.key.boundingRegions.find(
          (br) => br.pageNumber === pageNumber,
        );
        if (!boundingRegion) return null;

        const polygon = boundingRegion.polygon;
        if (!polygon || polygon.length < 8) return null; // Need at least 4 points (8 coordinates)

        // Convert polygon to bounding box for overlay
        const xs = [];
        const ys = [];
        for (let i = 0; i < polygon.length; i += 2) {
          xs.push(polygon[i]);
          ys.push(polygon[i + 1]);
        }

        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);

        // Scale to display coordinates
        const scaleX = imgRect.width / imageDimensions.width;
        const scaleY = imgRect.height / imageDimensions.height;

        const left = minX * scaleX;
        const top = minY * scaleY;
        const width = (maxX - minX) * scaleX;
        const height = (maxY - minY) * scaleY;

        // Color based on confidence
        const confidenceColor =
          kvp.confidence >= 0.9
            ? "rgba(34, 197, 94, 0.3)" // green
            : kvp.confidence >= 0.7
              ? "rgba(251, 191, 36, 0.3)" // yellow
              : "rgba(239, 68, 68, 0.3)"; // red

        const borderColor = confidenceColor.replace("0.3", "1");

        const tooltipLabel = (
          <div style={{ padding: "4px", fontSize: "14px", lineHeight: "1.4" }}>
            <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
              Key: "{kvp.key.content || "Unknown"}"
            </div>
            {kvp.value?.content && (
              <div style={{ marginBottom: "4px" }}>
                Value: "{kvp.value.content}"
              </div>
            )}
            <div
              style={{ fontSize: "12px", color: "#666", fontWeight: "normal" }}
            >
              Confidence: {Math.round(kvp.confidence * 100)}%
            </div>
          </div>
        );

        return (
          <Tooltip
            key={index}
            label={tooltipLabel}
            withArrow
            withinPortal
            openDelay={150}
            closeDelay={150}
            multiline
            position="top"
            zIndex={10000}
            portalProps={{
              target: document.body,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                pointerEvents: "auto",
                cursor: "pointer",
                borderRadius: "4px",
                borderWidth: "2px",
                borderStyle: "solid",
                borderColor,
                backgroundColor: confidenceColor,
                transition: "box-shadow 120ms ease, transform 120ms ease",
              }}
            />
          </Tooltip>
        );
      });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f8fafc",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleOverlays}
            leftSection={
              showOverlays ? <IconEye size={16} /> : <IconEyeOff size={16} />
            }
          >
            {showOverlays ? "Hide" : "Show"} Overlays
          </Button>
          <span style={{ fontSize: "0.875rem", color: "#4b5563" }}>
            {keyValuePairs.length} key-value pairs
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <IconZoomOut size={16} />
          </Button>
          <span
            style={{
              fontSize: "0.875rem",
              color: "#4b5563",
              minWidth: "60px",
              textAlign: "center",
            }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <IconZoomIn size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetZoom}>
            <IconRotateClockwise size={16} />
          </Button>
        </div>
      </div>

      {/* Image Viewer */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: "auto",
          backgroundColor: "#f1f5f9",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-block",
            transform: `scale(${zoom})`,
            transformOrigin: "center",
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Document page"
            style={{
              display: "block",
              maxWidth: "100%",
              height: "auto",
              boxShadow: "0 10px 25px rgba(15, 23, 42, 0.15)",
            }}
            onLoad={handleImageLoad}
          />
          {renderKeyValueOverlays()}
        </div>
      </div>

      {/* Status Footer */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid #e5e7eb",
          backgroundColor: "#f8fafc",
          fontSize: "0.875rem",
          color: "#4b5563",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Page {pageNumber}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span>
              Image: {imageDimensions.width} × {imageDimensions.height}
            </span>
            <span>Green: ≥90% | Yellow: 70-89% | Red: &lt;70%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
