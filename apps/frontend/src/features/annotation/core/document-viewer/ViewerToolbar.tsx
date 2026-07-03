import {
  IconChevronLeft,
  IconChevronRight,
  IconRotateClockwise,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react";
import { FC } from "react";
import {
  Divider,
  Group,
  IconActionButton,
  NumberInput,
  Text,
} from "../../../../ui";

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
      className="bcds-viewer-toolbar"
      style={{
        background: "var(--surface-color-background-light-gray)",
        borderBottom:
          "var(--layout-border-width-small) solid var(--surface-color-border-default)",
      }}
    >
      <IconActionButton
        tooltip="Previous page"
        variant="subtle"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        icon={<IconChevronLeft size={18} />}
      />

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

      <IconActionButton
        tooltip="Next page"
        variant="subtle"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        icon={<IconChevronRight size={18} />}
      />

      {showZoom && (
        <>
          <Divider orientation="vertical" />

          <IconActionButton
            tooltip="Zoom out"
            variant="subtle"
            onClick={onZoomOut}
            icon={<IconZoomOut size={18} />}
          />

          <Text size="sm" style={{ minWidth: 50, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </Text>

          <IconActionButton
            tooltip="Zoom in"
            variant="subtle"
            onClick={onZoomIn}
            icon={<IconZoomIn size={18} />}
          />

          <IconActionButton
            tooltip="Reset zoom"
            variant="subtle"
            onClick={onZoomReset}
            icon={<IconZoomReset size={18} />}
          />
        </>
      )}

      {onRotate && (
        <>
          <Divider orientation="vertical" />
          <IconActionButton
            tooltip="Rotate"
            variant="subtle"
            onClick={onRotate}
            icon={<IconRotateClockwise size={18} />}
          />
        </>
      )}
    </Group>
  );
};
