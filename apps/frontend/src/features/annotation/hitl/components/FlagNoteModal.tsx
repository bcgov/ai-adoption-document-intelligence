import { FC, useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, Textarea } from "../../../../ui";

interface FlagNoteModalProps {
  opened: boolean;
  initialNote: string;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

// Keeps the note draft in local state so typing doesn't re-render the workspace page.
export const FlagNoteModal: FC<FlagNoteModalProps> = ({
  opened,
  initialNote,
  isSubmitting,
  onClose,
  onConfirm,
}) => {
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    if (opened) {
      setNote(initialNote);
    }
  }, [opened, initialNote]);

  return (
    <Modal opened={opened} onClose={onClose} title="Flag document">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Flagging returns this document to the queue without a lock. Add a
          short note so the next reviewer knows what stopped you.
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
            Flag document
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
