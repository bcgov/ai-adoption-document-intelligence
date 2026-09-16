import {
  IconArrowLeft,
  IconArrowsSort,
  IconCheck,
  IconFlag,
  IconLayoutGrid,
  IconPhoto,
  IconPlayerSkipForward,
  IconX,
} from "@tabler/icons-react";
import { FC } from "react";
import {
  Button,
  Group,
  IconActionButton,
  Switch,
  Tooltip,
} from "../../../../ui";

type ViewMode = "document" | "snippet";
type SortMode = "confidence" | "alphabetical";

interface ReviewToolbarProps {
  onBack: () => void;
  onApprove: () => void;
  onFlag: () => void;
  onReject: () => void;
  onSkip: () => void;
  isApproving?: boolean;
  isFlagging?: boolean;
  isSkipping?: boolean;
  isRejecting?: boolean;
  /** Note captured from a prior flag on this session, if one exists. */
  flagNote?: string | null;
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
  onReject,
  onSkip,
  isApproving,
  isFlagging,
  isSkipping,
  isRejecting,
  flagNote,
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
        <Tooltip label={flagNote ? `Flag note: ${flagNote}` : "Flag document"}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <Button
              variant="light"
              color="orange"
              leftSection={<IconFlag size={16} />}
              onClick={onFlag}
              loading={isFlagging}
            >
              Flag
            </Button>
            {flagNote && (
              <span
                aria-label="Flag has a note"
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "var(--mantine-color-red-6, #e03131)",
                  color: "white",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: "14px",
                  textAlign: "center",
                }}
              >
                !
              </span>
            )}
          </div>
        </Tooltip>
        <Button
          variant="light"
          color="red"
          leftSection={<IconX size={16} />}
          onClick={onReject}
          loading={isRejecting}
        >
          Reject
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
