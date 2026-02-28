import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface CreateProjectDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description?: string }) => void;
  isCreating: boolean;
  createError: Error | null;
  onResetError: () => void;
}

export function CreateProjectDialog({
  opened,
  onClose,
  onCreate,
  isCreating,
  createError,
  onResetError,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const wasCreating = useRef(false);

  const handleClose = () => {
    setName("");
    setDescription("");
    setNameError("");
    onResetError();
    onClose();
  };

  // Close dialog when mutation completes successfully (no error)
  useEffect(() => {
    if (wasCreating.current && !isCreating && !createError) {
      setName("");
      setDescription("");
      setNameError("");
      onResetError();
      onClose();
    }
    wasCreating.current = isCreating;
  }, [isCreating, createError, onClose, onResetError]);

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError("Project name is required");
      return;
    }

    setNameError("");

    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create New Project"
      size="md"
      data-testid="create-project-dialog"
    >
      <Stack gap="md">
        {createError && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Failed to create project"
            color="red"
            variant="light"
            data-testid="create-project-error"
          >
            {createError.message}
          </Alert>
        )}

        <TextInput
          label="Project Name"
          placeholder="Enter project name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) {
              setNameError("");
            }
            if (createError) {
              onResetError();
            }
          }}
          error={nameError}
          required
          data-testid="project-name-input"
          data-autofocus
        />

        <Textarea
          label="Description"
          placeholder="Enter project description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          data-testid="project-description-input"
        />

        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={isCreating}
            data-testid="cancel-project-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isCreating}
            data-testid="submit-project-btn"
          >
            Create Project
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
