import { FC } from "react";
import { ScrollArea, Stack, Box, Text } from "@mantine/core";
import { Page } from "react-pdf";

interface ThumbnailStripProps {
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  width?: number;
}

export const ThumbnailStrip: FC<ThumbnailStripProps> = ({
  totalPages,
  currentPage,
  onPageSelect,
  width = 120,
}) => {
  return (
    <ScrollArea
      style={{
        height: "100%",
        borderRight: "1px solid #dee2e6",
        background: "#f8f9fa",
      }}
    >
      <Stack gap="xs" p="xs">
        {Array.from({ length: totalPages }, (_, index) => {
          const pageNumber = index + 1;
          const isSelected = pageNumber === currentPage;

          return (
            <Box
              key={pageNumber}
              onClick={() => onPageSelect(pageNumber)}
              style={{
                cursor: "pointer",
                border: isSelected ? "2px solid #228be6" : "1px solid #dee2e6",
                borderRadius: 4,
                padding: 4,
                background: isSelected ? "#e7f5ff" : "white",
                transition: "all 0.2s",
              }}
            >
              <Box
                style={{
                  pointerEvents: "none",
                  opacity: 0.8,
                }}
              >
                <Page
                  pageNumber={pageNumber}
                  width={width}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Box>
              <Text
                size="xs"
                ta="center"
                mt={4}
                c={isSelected ? "blue" : "dimmed"}
                fw={isSelected ? 600 : 400}
              >
                {pageNumber}
              </Text>
            </Box>
          );
        })}
      </Stack>
    </ScrollArea>
  );
};
