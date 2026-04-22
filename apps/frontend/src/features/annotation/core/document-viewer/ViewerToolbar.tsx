import { ActionIcon, Divider, Group, NumberInput, Text } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconRotateClockwise,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react";
import { FC } from "react";

interface ViewerToolbarProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onRotate?: () => void;
}

export const ViewerToolbar: FC<ViewerToolbarProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onRotate,
}) => {
  const handlePageInputChange = (value: number | string) => {
    const page = typeof value === "number" ? value : parseInt(value, 10);
    if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  const showZoom = zoom != null && onZoomIn && onZoomOut && onZoomReset;

  return (
    <Group
      gap="xs"
      p="xs"
      style={{ background: "#f8f9fa", borderBottom: "1px solid #dee2e6" }}
    >
      {/* Page Navigation */}
      <ActionIcon
        variant="subtle"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        <IconChevronLeft size={18} />
      </ActionIcon>

      <Group gap={5}>
        <NumberInput
          value={currentPage}
          onChange={handlePageInputChange}
          min={1}
          max={totalPages}
          size="xs"
          style={{ width: 60 }}
          hideControls
        />
        <Text size="sm" c="dimmed">
          / {totalPages}
        </Text>
      </Group>

      <ActionIcon
        variant="subtle"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
      >
        <IconChevronRight size={18} />
      </ActionIcon>

      {showZoom && (
        <>
          <Divider orientation="vertical" />

          <ActionIcon variant="subtle" onClick={onZoomOut}>
            <IconZoomOut size={18} />
          </ActionIcon>

          <Text size="sm" style={{ minWidth: 50, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </Text>

          <ActionIcon variant="subtle" onClick={onZoomIn}>
            <IconZoomIn size={18} />
          </ActionIcon>

          <ActionIcon variant="subtle" onClick={onZoomReset}>
            <IconZoomReset size={18} />
          </ActionIcon>
        </>
      )}

      {onRotate && (
        <>
          <Divider orientation="vertical" />
          <ActionIcon variant="subtle" onClick={onRotate}>
            <IconRotateClockwise size={18} />
          </ActionIcon>
        </>
      )}
    </Group>
  );
};
