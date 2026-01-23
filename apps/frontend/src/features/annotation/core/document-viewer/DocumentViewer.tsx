import { FC, useState } from "react";
import { Document } from "react-pdf";
import { Box, Grid, Center, Text, Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { PageRenderer } from "./PageRenderer";
import { ViewerToolbar } from "./ViewerToolbar";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { useCanvasZoom } from "../canvas/hooks/useCanvasZoom";

// Configure react-pdf worker
import { pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  documentUrl: string;
  showThumbnails?: boolean;
  onPageChange?: (page: number) => void;
  onDocumentLoadSuccess?: (numPages: number) => void;
}

export const DocumentViewer: FC<DocumentViewerProps> = ({
  documentUrl,
  showThumbnails = true,
  onPageChange,
  onDocumentLoadSuccess,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [error, setError] = useState<Error | null>(null);
  const { zoom, zoomIn, zoomOut, resetZoom } = useCanvasZoom();

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

      <Grid gutter={0} style={{ flex: 1, overflow: "hidden" }}>
        {showThumbnails && numPages > 0 && (
          <Grid.Col span="auto" style={{ maxWidth: 150, overflow: "auto" }}>
            <Document file={documentUrl}>
              <ThumbnailStrip
                totalPages={numPages}
                currentPage={currentPage}
                onPageSelect={handlePageChange}
              />
            </Document>
          </Grid.Col>
        )}

        <Grid.Col span="auto" style={{ overflow: "auto", background: "#f1f3f5" }}>
          <Center style={{ minHeight: "100%", padding: 20 }}>
            <Document
              file={documentUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={handleDocumentLoadError}
            >
              <PageRenderer
                pageNumber={currentPage}
                scale={zoom}
                onPageLoadError={(err) => setError(err)}
              />
            </Document>
          </Center>
        </Grid.Col>
      </Grid>
    </Box>
  );
};
