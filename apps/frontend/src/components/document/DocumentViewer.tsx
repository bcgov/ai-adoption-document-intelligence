import { Button, Tooltip } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconRotateClockwise,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import * as pdfjsLib from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import type { BoundingRegion, ExtractedFields } from "../../shared/types";

// Configure pdfjs worker - use worker from public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface DocumentViewerProps {
  imageUrl: string;
  extractedFields?: ExtractedFields;
  pageNumber?: number;
  onZoomChange?: (zoom: number) => void;
  showOverlays?: boolean;
  onToggleOverlays?: () => void;
  fileType?: string;
}

export function DocumentViewer({
  imageUrl,
  extractedFields = {},
  pageNumber = 1,
  onZoomChange,
  showOverlays = true,
  onToggleOverlays,
  fileType,
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [imageDimensions, setImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [pdfImageUrl, setPdfImageUrl] = useState<string>("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfPageDimensions, setPdfPageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(pageNumber || 1);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPdf = fileType === "pdf";

  // Update current page when pageNumber prop changes
  useEffect(() => {
    setCurrentPage(pageNumber || 1);
  }, [pageNumber]);

  useEffect(() => {
    if (onZoomChange) {
      onZoomChange(zoom);
    }
  }, [zoom, onZoomChange]);

  // Load PDF and render page to image
  useEffect(() => {
    const loadPdfPage = async () => {
      if (!imageUrl || !isPdf) return;

      setLoadingPdf(true);
      try {
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        setTotalPages(pdf.numPages);
        const targetPage = Math.min(currentPage, pdf.numPages);
        const page = await pdf.getPage(targetPage);
        const viewport = page.getViewport({ scale: 2.0 });

        // Store the original PDF page dimensions (in points) for coordinate scaling
        const pageViewport = page.getViewport({ scale: 1.0 });
        setPdfPageDimensions({
          width: pageViewport.width,
          height: pageViewport.height,
        });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not get canvas context");
        }

        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        }).promise;

        const renderedImageUrl = canvas.toDataURL("image/png");
        setPdfImageUrl(renderedImageUrl);
        // Reset image loaded state so overlays can re-render for new page
        setIsImageLoaded(false);
      } catch (_error) {
        // Error loading PDF - removed console for lint compliance
      } finally {
        setLoadingPdf(false);
      }
    };

    if (isPdf && imageUrl) {
      void loadPdfPage();
    } else {
      setPdfImageUrl("");
      setPdfPageDimensions({ width: 0, height: 0 });
      setTotalPages(1);
    }
  }, [isPdf, imageUrl, currentPage]);

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
  const handlePreviousPage = () =>
    setCurrentPage((prev) => Math.max(1, prev - 1));
  const handleNextPage = () =>
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));

  const fieldEntries = Object.entries(extractedFields);

  const getFieldDisplayValue = (field: ExtractedFields[string]): string => {
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
  };

  const renderFieldOverlays = () => {
    if (
      !showOverlays ||
      !isImageLoaded ||
      !imageRef.current ||
      fieldEntries.length === 0
    ) {
      return null;
    }

    const img = imageRef.current;
    const imgRect = img.getBoundingClientRect();
    const pageToUse = isPdf ? currentPage : pageNumber;

    const fieldsForPage = fieldEntries.filter(([, field]) =>
      field.boundingRegions?.some(
        (br: BoundingRegion) => br.pageNumber === pageToUse,
      ),
    );

    return fieldsForPage.map(([fieldName, field], index) => {
      // Use the bounding region for this page
      const boundingRegion = field.boundingRegions?.find(
        (br: BoundingRegion) => br.pageNumber === pageToUse,
      );
      if (!boundingRegion) {
        return null;
      }

      const polygon = boundingRegion.polygon;
      if (!polygon || polygon.length < 8) {
        return null; // Need at least 4 points (8 coordinates)
      }

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
      // For PDFs, bounding regions are in PDF points (72 DPI), need to scale to rendered image
      let scaleX: number;
      let scaleY: number;

      if (isPdf) {
        // For PDFs, bounding regions are typically in PDF coordinate space (points)
        // The rendered image natural size is PDF dimensions * render scale (2.0)
        // But we need to check if coordinates are normalized (0-1) or in points
        // Try using natural dimensions first (assumes coordinates match rendered size)
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          scaleX = imgRect.width / img.naturalWidth;
          scaleY = imgRect.height / img.naturalHeight;
        } else if (
          pdfPageDimensions.width > 0 &&
          pdfPageDimensions.height > 0
        ) {
          // Fallback: use PDF page dimensions (if coordinates are in PDF points)
          // Account for 2x render scale
          scaleX = imgRect.width / (pdfPageDimensions.width * 2.0);
          scaleY = imgRect.height / (pdfPageDimensions.height * 2.0);
        } else {
          // Last resort: use imageDimensions
          scaleX = imgRect.width / imageDimensions.width;
          scaleY = imgRect.height / imageDimensions.height;
        }
      } else {
        // For regular images, use natural dimensions
        scaleX = imgRect.width / imageDimensions.width;
        scaleY = imgRect.height / imageDimensions.height;
      }

      const left = minX * scaleX;
      const top = minY * scaleY;
      const width = (maxX - minX) * scaleX;
      const height = (maxY - minY) * scaleY;

      // Color based on confidence
      const confidenceColor =
        field.confidence >= 0.9
          ? "rgba(34, 197, 94, 0.3)" // green
          : field.confidence >= 0.7
            ? "rgba(251, 191, 36, 0.3)" // yellow
            : "rgba(239, 68, 68, 0.3)"; // red

      const borderColor = confidenceColor.replace("0.3", "1");

      const tooltipLabel = (
        <div style={{ padding: "4px", fontSize: "14px", lineHeight: "1.4" }}>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
            {fieldName}
          </div>
          <div style={{ marginBottom: "4px" }}>
            Value: {getFieldDisplayValue(field)}
          </div>
          <div style={{ marginBottom: "4px", fontSize: "12px", color: "#888" }}>
            Type: {field.type}
          </div>
          <div
            style={{ fontSize: "12px", color: "#666", fontWeight: "normal" }}
          >
            Confidence: {Math.round(field.confidence * 100)}%
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
            {fieldEntries.length} fields
          </span>
          {isPdf && totalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginLeft: "16px",
              }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage === 1 || loadingPdf}
                leftSection={<IconChevronLeft size={16} />}
              >
                Previous
              </Button>
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "#4b5563",
                  minWidth: "80px",
                  textAlign: "center",
                }}
              >
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages || loadingPdf}
                rightSection={<IconChevronRight size={16} />}
              >
                Next
              </Button>
            </div>
          )}
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
            transform: isPdf ? "none" : `scale(${zoom})`,
            transformOrigin: "center",
          }}
        >
          {loadingPdf || (isPdf && !pdfImageUrl) ? (
            <div
              style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}
            >
              Loading PDF page...
            </div>
          ) : (isPdf ? pdfImageUrl : imageUrl) ? (
            <img
              ref={imageRef}
              src={isPdf ? pdfImageUrl : imageUrl}
              alt="Document page"
              style={{
                display: "block",
                maxWidth: "100%",
                height: "auto",
                boxShadow: "0 10px 25px rgba(15, 23, 42, 0.15)",
              }}
              onLoad={handleImageLoad}
            />
          ) : null}
          {renderFieldOverlays()}
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
          <span>Page {currentPage}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span>
              {isPdf
                ? `PDF: ${pdfPageDimensions.width.toFixed(0)} × ${pdfPageDimensions.height.toFixed(0)}`
                : `Image: ${imageDimensions.width} × ${imageDimensions.height}`}
            </span>
            <span>Green: ≥90% | Yellow: 70-89% | Red: &lt;70%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
