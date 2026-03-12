import { Alert, Box, Center, Grid, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { IconAlertCircle } from "@tabler/icons-react";
import { FC, useEffect, useRef, useState } from "react";
// Configure react-pdf worker
import { Document, pdfjs } from "react-pdf";
import { useCanvasZoom } from "../canvas/hooks/useCanvasZoom";
import { PageRenderer } from "./PageRenderer";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { ViewerToolbar } from "./ViewerToolbar";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  documentUrl: string;
  showThumbnails?: boolean;
  fitToContainer?: boolean;
  onPageChange?: (page: number) => void;
  onDocumentLoadSuccess?: (numPages: number) => void;
}

export const DocumentViewer: FC<DocumentViewerProps> = ({
  documentUrl,
  showThumbnails = true,
  fitToContainer = false,
  onPageChange,
  onDocumentLoadSuccess,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [error, setError] = useState<Error | null>(null);
  const { zoom, zoomIn, zoomOut, resetZoom, zoomToFit } = useCanvasZoom();
  const {
    ref: containerRef,
    width: containerWidth,
    height: containerHeight,
  } = useElementSize();
  const [pageOriginalSize, setPageOriginalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const initialZoomSetRef = useRef(false);

  const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
    onDocumentLoadSuccess?.(numPages);
  };

  const handleDocumentLoadError = (err: Error) => {
    setError(err);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    onPageChange?.(page);
  };

  // Auto-fit to container when fitToContainer is enabled
  useEffect(() => {
    if (
      fitToContainer &&
      !initialZoomSetRef.current &&
      containerWidth > 0 &&
      containerHeight > 0 &&
      pageOriginalSize
    ) {
      zoomToFit(
        containerWidth - 40,
        containerHeight - 40,
        pageOriginalSize.width,
        pageOriginalSize.height,
      );
      initialZoomSetRef.current = true;
    }
  }, [
    fitToContainer,
    containerWidth,
    containerHeight,
    pageOriginalSize,
    zoomToFit,
  ]);

  if (error) {
    return (
      <Center h="100%">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Error loading document"
          color="red"
        >
          {error.message}
        </Alert>
      </Center>
    );
  }

  if (!documentUrl) {
    return (
      <Center h="100%">
        <Text c="dimmed">No document to display</Text>
      </Center>
    );
  }

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {numPages > 0 && (
        <ViewerToolbar
          currentPage={currentPage}
          totalPages={numPages}
          zoom={zoom}
          onPageChange={handlePageChange}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={resetZoom}
        />
      )}

      <Grid
        gutter={0}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          gridTemplateRows: "1fr",
        }}
      >
        {showThumbnails && numPages > 0 && (
          <Grid.Col
            span="auto"
            style={{ maxWidth: 120, minHeight: 0, overflow: "auto" }}
          >
            <Document file={documentUrl}>
              <ThumbnailStrip
                totalPages={numPages}
                currentPage={currentPage}
                onPageSelect={handlePageChange}
              />
            </Document>
          </Grid.Col>
        )}

        <Grid.Col
          ref={containerRef}
          span="auto"
          style={{
            minHeight: 0,
            height: "100%",
            overflow: "auto",
            background: "#f1f3f5",
          }}
        >
          <Box
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100%",
              padding: fitToContainer ? 8 : 20,
            }}
          >
            <Document
              file={documentUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={handleDocumentLoadError}
            >
              <PageRenderer
                pageNumber={currentPage}
                scale={zoom}
                onPageLoadSuccess={(_, width, height) => {
                  setPageOriginalSize({ width, height });
                }}
                onPageLoadError={(err) => setError(err)}
              />
            </Document>
          </Box>
        </Grid.Col>
      </Grid>
    </Box>
  );
};
