import { Group, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Text } from "./Text";

export interface ConfirmActionModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  confirmLoading?: boolean;
  centered?: boolean;
  "data-testid"?: string;
  cancelButtonTestId?: string;
  confirmButtonTestId?: string;
}

/**
 * Shared confirmation modal for destructive/irreversible actions.
 * Keeps title, copy, and action layout consistent across the app.
 */
export function ConfirmActionModal({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = "red",
  confirmLoading = false,
  centered = true,
  "data-testid": dataTestId,
  cancelButtonTestId,
  confirmButtonTestId,
}: ConfirmActionModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered={centered}
      data-testid={dataTestId}
    >
      <Stack gap="md">
        {typeof message === "string" ? <Text>{message}</Text> : message}
        <Group justify="flex-end" mt="xs">
          <Button
            variant="default"
            onClick={onClose}
            data-testid={cancelButtonTestId}
          >
            {cancelLabel}
          </Button>
          <Button
            color={confirmColor}
            onClick={onConfirm}
            loading={confirmLoading}
            data-testid={confirmButtonTestId}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
