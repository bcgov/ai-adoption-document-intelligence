import {
  IconArrowLeft,
  IconArrowsSort,
  IconCheck,
  IconFlag,
  IconLayoutGrid,
  IconPhoto,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import { FC } from "react";
import { Button, Group, IconActionButton, Switch } from "../../../../ui";

type ViewMode = "document" | "snippet";
type SortMode = "confidence" | "alphabetical";

interface ReviewToolbarProps {
  onBack: () => void;
  onApprove: () => void;
  onFlag: () => void;
  onSkip: () => void;
  isApproving?: boolean;
  isFlagging?: boolean;
  isSkipping?: boolean;
  autoAdvance?: boolean;
  onAutoAdvanceToggle?: () => void;
  viewMode?: ViewMode;
  onViewModeToggle?: () => void;
  sortMode?: SortMode;
  onSortModeToggle?: () => void;
}

export const ReviewToolbar: FC<ReviewToolbarProps> = ({
  onBack,
  onApprove,
  onFlag,
  onSkip,
  isApproving,
  isFlagging,
  isSkipping,
  autoAdvance,
  onAutoAdvanceToggle,
  viewMode,
  onViewModeToggle,
  sortMode,
  onSortModeToggle,
}) => {
  return (
    <Group justify="space-between">
      <Group>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          leftSection={<IconCheck size={16} />}
          onClick={onApprove}
          loading={isApproving}
        >
          Approve
        </Button>
        <Button
          variant="light"
          color="orange"
          leftSection={<IconFlag size={16} />}
          onClick={onFlag}
          loading={isFlagging}
        >
          Flag
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

      <Group>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconPlayerSkipForward size={16} />}
          onClick={onSkip}
          loading={isSkipping}
        >
          Skip
        </Button>
        {onAutoAdvanceToggle && (
          <Switch
            size="sm"
            label="Auto-advance"
            checked={autoAdvance ?? true}
            onChange={onAutoAdvanceToggle}
          />
        )}
      </Group>
    </Group>
  );
};
