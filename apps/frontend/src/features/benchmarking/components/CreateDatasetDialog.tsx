import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";

interface CreateDatasetDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
    repositoryUrl: string;
  }) => void;
  isCreating: boolean;
}

export function CreateDatasetDialog({
  opened,
  onClose,
  onCreate,
  isCreating,
}: CreateDatasetDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [metadataKey, setMetadataKey] = useState("");
  const [metadataValue, setMetadataValue] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState("");
  const [repositoryUrlError, setRepositoryUrlError] = useState("");

  const handleClose = () => {
    setName("");
    setDescription("");
    setRepositoryUrl("");
    setMetadataKey("");
    setMetadataValue("");
    setMetadata({});
    setNameError("");
    setRepositoryUrlError("");
    onClose();
  };

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

    if (!repositoryUrl.trim()) {
      setRepositoryUrlError("Repository URL is required");
      hasError = true;
    } else {
      setRepositoryUrlError("");
    }

    if (hasError) {
      return;
    }

    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      repositoryUrl: repositoryUrl.trim(),
    });

    handleClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create New Dataset"
      size="md"
    >
      <Stack gap="md">
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
        />

        <Textarea
          label="Description"
          placeholder="Enter dataset description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <TextInput
          label="Repository URL"
          placeholder="Enter DVC repository URL"
          value={repositoryUrl}
          onChange={(e) => {
            setRepositoryUrl(e.target.value);
            if (e.target.value.trim()) {
              setRepositoryUrlError("");
            }
          }}
          error={repositoryUrlError}
          required
        />

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Metadata (optional)
          </Text>
          {Object.entries(metadata).map(([key, value]) => (
            <Group key={key} justify="space-between">
              <Text size="sm">
                <strong>{key}:</strong> {value}
              </Text>
              <Button
                variant="subtle"
                size="xs"
                color="red"
                onClick={() => handleRemoveMetadata(key)}
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
            />
            <TextInput
              placeholder="Value"
              value={metadataValue}
              onChange={(e) => setMetadataValue(e.target.value)}
              style={{ flex: 1 }}
              size="sm"
            />
            <Button
              variant="light"
              size="sm"
              onClick={handleAddMetadata}
              disabled={!metadataKey.trim() || !metadataValue.trim()}
            >
              Add
            </Button>
          </Group>
        </Stack>

        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isCreating}>
            Create Dataset
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
