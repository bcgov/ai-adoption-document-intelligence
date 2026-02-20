import {
  Button,
  Group,
  Modal,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";

interface CreateProjectDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description?: string }) => void;
  isCreating: boolean;
}

export function CreateProjectDialog({
  opened,
  onClose,
  onCreate,
  isCreating,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const wasCreating = useRef(false);

  const handleClose = () => {
    setName("");
    setDescription("");
    setNameError("");
    onClose();
  };

  // Close dialog when mutation completes successfully
  useEffect(() => {
    if (wasCreating.current && !isCreating) {
      setName("");
      setDescription("");
      setNameError("");
      onClose();
    }
    wasCreating.current = isCreating;
  }, [isCreating, onClose]);

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
        <TextInput
          label="Project Name"
          placeholder="Enter project name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) {
              setNameError("");
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
