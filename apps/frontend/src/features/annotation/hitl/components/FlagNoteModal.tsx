import { FC, useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, Textarea } from "../../../../ui";

interface FlagNoteModalProps {
  opened: boolean;
  activeFlagCount: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

// Always opens blank: flagging raises a new, independent flag rather than editing an existing one.
export const FlagNoteModal: FC<FlagNoteModalProps> = ({
  opened,
  activeFlagCount,
  isSubmitting,
  onClose,
  onConfirm,
}) => {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (opened) {
      setNote("");
    }
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title="Add a flag">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {activeFlagCount > 0
            ? `This document already has ${activeFlagCount} active flag${
                activeFlagCount === 1 ? "" : "s"
              }. This adds another, independently resolvable flag rather than replacing them.`
            : "Flagging returns this document to the queue without a lock. Add a short note so the next reviewer knows what stopped you."}
        </Text>

        <Textarea
          placeholder="What should the next reviewer know?"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          minRows={3}
          disabled={isSubmitting}
        />

        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            color="gray"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="orange"
            onClick={() => onConfirm(note)}
            loading={isSubmitting}
          >
            Add flag
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
