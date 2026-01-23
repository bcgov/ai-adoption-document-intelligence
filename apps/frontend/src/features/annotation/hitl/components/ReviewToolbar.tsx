import { FC } from "react";
import { Button, Group } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconPlayerSkipForward,
} from "@tabler/icons-react";

interface ReviewToolbarProps {
  onApprove: () => void;
  onEscalate: () => void;
  onSkip: () => void;
  isApproving?: boolean;
  isEscalating?: boolean;
  isSkipping?: boolean;
}

export const ReviewToolbar: FC<ReviewToolbarProps> = ({
  onApprove,
  onEscalate,
  onSkip,
  isApproving,
  isEscalating,
  isSkipping,
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
