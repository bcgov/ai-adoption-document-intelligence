import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconCheck,
  IconLayoutGrid,
  IconPhoto,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import { FC } from "react";

type ViewMode = "document" | "snippet";
type SortMode = "confidence" | "alphabetical";

interface ReviewToolbarProps {
  onApprove: () => void;
  onEscalate: () => void;
  onSkip: () => void;
  isApproving?: boolean;
  isEscalating?: boolean;
  isSkipping?: boolean;
  viewMode?: ViewMode;
  onViewModeToggle?: () => void;
  sortMode?: SortMode;
  onSortModeToggle?: () => void;
}

export const ReviewToolbar: FC<ReviewToolbarProps> = ({
  onApprove,
  onEscalate,
  onSkip,
  isApproving,
  isEscalating,
  isSkipping,
  viewMode,
  onViewModeToggle,
  sortMode,
  onSortModeToggle,
}) => {
  return (
    <Group justify="space-between">
      <Group>
        <Button
          leftSection={<IconCheck size={16} />}
          onClick={onApprove}
          loading={isApproving}
        >
          Approve
        </Button>
        <Button
          variant="light"
          color="yellow"
          leftSection={<IconAlertTriangle size={16} />}
          onClick={onEscalate}
          loading={isEscalating}
        >
          Escalate
        </Button>
      </Group>

      <Group>
        {onViewModeToggle && (
          <Tooltip
            label={
              viewMode === "document"
                ? "Switch to snippet view (Ctrl+Shift+V)"
                : "Switch to document view (Ctrl+Shift+V)"
            }
          >
            <ActionIcon variant="subtle" onClick={onViewModeToggle} size="lg">
              {viewMode === "document" ? (
                <IconLayoutGrid size={18} />
              ) : (
                <IconPhoto size={18} />
              )}
            </ActionIcon>
          </Tooltip>
        )}
        {onSortModeToggle && (
          <Tooltip
            label={
              sortMode === "confidence"
                ? "Sorting by confidence (Ctrl+Shift+O)"
                : "Sort by confidence (Ctrl+Shift+O)"
            }
          >
            <ActionIcon
              variant={sortMode === "confidence" ? "filled" : "subtle"}
              onClick={onSortModeToggle}
              size="lg"
            >
              <IconArrowsSort size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <Button
        variant="subtle"
        color="gray"
        leftSection={<IconPlayerSkipForward size={16} />}
        onClick={onSkip}
        loading={isSkipping}
      >
        Skip
      </Button>
    </Group>
  );
};
