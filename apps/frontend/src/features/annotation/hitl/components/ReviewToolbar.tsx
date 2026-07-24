import {
  IconAlertTriangle,
  IconArrowsSort,
  IconCheck,
  IconLayoutGrid,
  IconPhoto,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import { FC } from "react";
import { Button, Group, IconActionButton } from "../../../../ui";

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
          <IconActionButton
            tooltip={
              viewMode === "document"
                ? "Switch to snippet view (Ctrl+Shift+V)"
                : "Switch to document view (Ctrl+Shift+V)"
            }
            variant="subtle"
            onClick={onViewModeToggle}
            icon={
              viewMode === "document" ? (
                <IconLayoutGrid size={18} />
              ) : (
                <IconPhoto size={18} />
              )
            }
          />
        )}
        {onSortModeToggle && (
          <IconActionButton
            tooltip={
              sortMode === "confidence"
                ? "Sorting by confidence (Ctrl+Shift+O)"
                : "Sort by confidence (Ctrl+Shift+O)"
            }
            variant={sortMode === "confidence" ? "filled" : "subtle"}
            onClick={onSortModeToggle}
            icon={<IconArrowsSort size={18} />}
          />
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
