import {
  IconArrowLeft,
  IconArrowsSort,
  IconCheck,
  IconDeviceFloppy,
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
  /** Omit to hide Reject, as when labelling a dataset: there is no workflow to reject. */
  onReject?: () => void;
  onSkip: () => void;
  /** Persists in-progress corrections without approving, flagging, rejecting or skipping. */
  onSave: () => void;
  isApproving?: boolean;
  isFlagging?: boolean;
  isSkipping?: boolean;
  isRejecting?: boolean;
  isSaving?: boolean;
  /** Count of unaddressed flags currently on this document. */
  activeFlagCount?: number;
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
  onSave,
  isApproving,
  isFlagging,
  isSkipping,
  isRejecting,
  isSaving,
  activeFlagCount,
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
          variant="default"
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={onSave}
          loading={isSaving}
        >
          Save
        </Button>
        <Button
          leftSection={<IconCheck size={16} />}
          onClick={onApprove}
          loading={isApproving}
        >
          Approve
        </Button>
        <Tooltip
          label={
            activeFlagCount
              ? `${activeFlagCount} active flag${activeFlagCount === 1 ? "" : "s"}`
              : "Flag document"
          }
        >
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
            {Boolean(activeFlagCount) && (
              <span
                aria-label={`${activeFlagCount} active flag${activeFlagCount === 1 ? "" : "s"}`}
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 14,
                  height: 14,
                  padding: "0 3px",
                  borderRadius: 7,
                  background: "var(--mantine-color-red-6, #e03131)",
                  color: "white",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: "14px",
                  textAlign: "center",
                }}
              >
                {activeFlagCount}
              </span>
            )}
          </div>
        </Tooltip>
        {onReject && (
          <Button
            variant="light"
            color="red"
            leftSection={<IconX size={16} />}
            onClick={onReject}
            loading={isRejecting}
          >
            Reject
          </Button>
        )}
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
