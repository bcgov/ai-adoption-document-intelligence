import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

interface CreateDatasetDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }) => void;
  isCreating: boolean;
  createError: Error | null;
  onResetError: () => void;
}

export function CreateDatasetDialog({
  opened,
  onClose,
  onCreate,
  isCreating,
  createError,
  onResetError,
}: CreateDatasetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState("");
  const wasCreating = useRef(false);

  const handleClose = () => {
    setName("");
    setDescription("");
    setMetadataKey("");
    setMetadataValue("");
    setMetadata({});
    setNameError("");
    onResetError();
    onClose();
  };

  // Close dialog when mutation completes successfully (no error)
  useEffect(() => {
    if (wasCreating.current && !isCreating && !createError) {
      // Clear form state
      setName("");
      setDescription("");
      setMetadataKey("");
      setMetadataValue("");
      setMetadata({});
      setNameError("");
      onResetError();
      // Close dialog
      onClose();
    }
    wasCreating.current = isCreating;
  }, [isCreating, createError, onClose, onResetError]);

  const handleAddMetadata = () => {
    if (metadataKey.trim() && metadataValue.trim()) {
      setMetadata({ ...metadata, [metadataKey.trim()]: metadataValue.trim() });
      setMetadataKey("");
      setMetadataValue("");
    }
  };

  const handleRemoveMetadata = (key: string) => {
    const newMetadata = { ...metadata };
    delete newMetadata[key];
    setMetadata(newMetadata);
  };

  const handleSubmit = () => {
    let hasError = false;

    if (!name.trim()) {
      setNameError("Dataset name is required");
      hasError = true;
    } else {
      setNameError("");
    }

    if (hasError) {
      return;
    }

    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    // Don't close immediately - let the useEffect handle closing after mutation succeeds
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create New Dataset"
      size="md"
      data-testid="create-dataset-dialog"
    >
      <Stack gap="md">
        {createError && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Failed to create dataset"
            color="red"
            variant="light"
            data-testid="create-dataset-error"
          >
            {createError.message}
          </Alert>
        )}

        <TextInput
          label="Dataset Name"
          placeholder="Enter dataset name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) {
              setNameError("");
            }
          }}
          error={nameError}
          required
          data-testid="dataset-name-input"
          data-autofocus
        />

        <Textarea
          label="Description"
          placeholder="Enter dataset description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          data-testid="dataset-description-input"
        />

        <Stack gap="xs" data-testid="dataset-metadata-section">
          <Text size="sm" fw={500}>
            Metadata (optional)
          </Text>
          {Object.entries(metadata).map(([key, value]) => (
            <Group
              key={key}
              justify="space-between"
              data-testid={`metadata-item-${key}`}
            >
              <Text size="sm">
                <strong>{key}:</strong> {value}
              </Text>
              <Button
                variant="subtle"
                size="xs"
                color="red"
                onClick={() => handleRemoveMetadata(key)}
                data-testid={`remove-metadata-${key}-btn`}
              >
                Remove
              </Button>
            </Group>
          ))}
          <Group gap="xs">
            <TextInput
              placeholder="Key"
              value={metadataKey}
              onChange={(e) => setMetadataKey(e.target.value)}
              style={{ flex: 1 }}
              size="sm"
              data-testid="metadata-key-input"
            />
            <TextInput
              placeholder="Value"
              value={metadataValue}
              onChange={(e) => setMetadataValue(e.target.value)}
              style={{ flex: 1 }}
              size="sm"
              data-testid="metadata-value-input"
            />
            <Button
              variant="light"
              size="sm"
              onClick={handleAddMetadata}
              disabled={!metadataKey.trim() || !metadataValue.trim()}
              data-testid="add-metadata-btn"
            >
              Add
            </Button>
          </Group>
        </Stack>

        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={isCreating}
            data-testid="cancel-dataset-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isCreating}
            data-testid="submit-dataset-btn"
          >
            Create Dataset
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
