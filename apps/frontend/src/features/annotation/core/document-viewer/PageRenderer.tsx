import { FC, useState } from "react";
import { Page } from "react-pdf";
import { Box, Loader, Center } from "@mantine/core";

interface PageRendererProps {
  pageNumber: number;
  width?: number;
  scale?: number;
  onPageLoadSuccess?: (pageNumber: number, width: number, height: number) => void;
  onPageLoadError?: (error: Error) => void;
}

export const PageRenderer: FC<PageRendererProps> = ({
  pageNumber,
  width,
  scale = 1,
  onPageLoadSuccess,
  onPageLoadError,
}) => {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoadSuccess = (page: any) => {
    setIsLoading(false);
    // Report original (unscaled) dimensions
    const originalWidth = page.originalWidth ?? page.width / scale;
    const originalHeight = page.originalHeight ?? page.height / scale;
    onPageLoadSuccess?.(pageNumber, originalWidth, originalHeight);
  };

  const handleLoadError = (error: Error) => {
    setIsLoading(false);
    onPageLoadError?.(error);
  };

  return (
    <Box
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      {isLoading && (
        <Center
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(255, 255, 255, 0.9)",
            zIndex: 10,
          }}
        >
          <Loader size="md" />
        </Center>
      )}
      <Page
        pageNumber={pageNumber}
        width={width}
        scale={scale}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        renderTextLayer={false}
        renderAnnotationLayer={false}
      />
    </Box>
  );
};
