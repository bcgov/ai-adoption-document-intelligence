/**
 * Split Management Component
 *
 * UI for creating, editing, and freezing dataset splits.
 * See US-033: Split Management UI
 */

import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconLock, IconLockOpen, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import type { ManifestSample } from "../hooks/useDatasetVersions";
import {
  type CreateSplitRequest,
  type Split,
  type SplitType,
  useCreateSplit,
  useFreezeSplit,
  useSplits,
  useUpdateSplit,
} from "../hooks/useSplits";

interface SplitManagementProps {
  datasetId: string;
  versionId: string;
  samples: ManifestSample[];
}

export function SplitManagement({
  datasetId,
  versionId,
  samples,
}: SplitManagementProps) {
  const { data: splits, isLoading } = useSplits(datasetId, versionId);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSplit, setEditingSplit] = useState<Split | null>(null);

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>Dataset Splits</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Split
        </Button>
      </Group>

      {splits && splits.length > 0 ? (
        <Card withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Samples</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {splits.map((split: Split) => (
                <Table.Tr key={split.id}>
                  <Table.Td>{split.name}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        split.type === "train"
                          ? "blue"
                          : split.type === "val"
                            ? "cyan"
                            : split.type === "test"
                              ? "grape"
                              : "yellow"
                      }
                    >
                      {split.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{split.sampleCount}</Table.Td>
                  <Table.Td>
                    <Badge color={split.frozen ? "gray" : "green"}>
                      {split.frozen ? "Frozen" : "Editable"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {new Date(split.createdAt).toLocaleDateString()}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {!split.frozen && (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => setEditingSplit(split)}
                        >
                          Edit
                        </Button>
                      )}
                      {!split.frozen && split.type === "golden" && (
                        <FreezeButton
                          datasetId={datasetId}
                          versionId={versionId}
                          splitId={split.id}
                        />
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      ) : (
        <Card withBorder>
          <Stack align="center" gap="md" py="xl">
            <IconLockOpen size={48} style={{ opacity: 0.5 }} />
            <Text c="dimmed">No splits defined yet</Text>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create First Split
            </Button>
          </Stack>
        </Card>
      )}

      <CreateSplitDialog
        datasetId={datasetId}
        versionId={versionId}
        samples={samples}
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {editingSplit && (
        <EditSplitDialog
          datasetId={datasetId}
          versionId={versionId}
          split={editingSplit}
          samples={samples}
          open={!!editingSplit}
          onClose={() => setEditingSplit(null)}
        />
      )}
    </Stack>
  );
}

interface CreateSplitDialogProps {
  datasetId: string;
  versionId: string;
  samples: ManifestSample[];
  open: boolean;
  onClose: () => void;
}

function CreateSplitDialog({
  datasetId,
  versionId,
  samples,
  open,
  onClose,
}: CreateSplitDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SplitType>("train");
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const createMutation = useCreateSplit(datasetId, versionId);

  const sampleOptions = samples.map((s) => ({
    value: s.id,
    label: s.id,
  }));

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Split name is required");
      return;
    }
    if (selectedSampleIds.length === 0) {
      setError("At least one sample must be selected");
      return;
    }

    const request: CreateSplitRequest = {
      name: name.trim(),
      type,
      sampleIds: selectedSampleIds,
    };

    try {
      await createMutation.mutateAsync(request);
      setName("");
      setType("train");
      setSelectedSampleIds([]);
      setError("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create split");
    }
  };

  return (
    <Modal opened={open} onClose={onClose} title="Create Split" size="lg">
      <Stack gap="md">
        <TextInput
          label="Split Name"
          placeholder="e.g., train-v1, golden-regression"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          error={error && !name.trim() ? error : ""}
          required
        />

        <Select
          label="Split Type"
          value={type}
          onChange={(value) => setType((value as SplitType) || "train")}
          data={[
            { value: "train", label: "Train" },
            { value: "val", label: "Validation" },
            { value: "test", label: "Test" },
            { value: "golden", label: "Golden Regression" },
          ]}
          required
        />

        <MultiSelect
          label="Select Samples"
          placeholder="Choose samples for this split"
          data={sampleOptions}
          value={selectedSampleIds}
          onChange={setSelectedSampleIds}
          searchable
          error={
            error && selectedSampleIds.length === 0
              ? "At least one sample required"
              : ""
          }
          required
        />

        <Text size="sm" c="dimmed">
          Selected {selectedSampleIds.length} of {samples.length} samples
        </Text>

        {error && !(!name.trim() || selectedSampleIds.length === 0) && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={createMutation.isPending}>
            Create Split
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface EditSplitDialogProps {
  datasetId: string;
  versionId: string;
  split: Split;
  samples: ManifestSample[];
  open: boolean;
  onClose: () => void;
}

function EditSplitDialog({
  datasetId,
  versionId,
  split,
  samples,
  open,
  onClose,
}: EditSplitDialogProps) {
  const [selectedSampleIds, setSelectedSampleIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const updateMutation = useUpdateSplit(datasetId, versionId, split.id);

  // Load current sample IDs when dialog opens
  useState(() => {
    if (open && !loaded) {
      // In a real implementation, we'd fetch the full split details
      // For now, we'll start with an empty selection
      setLoaded(true);
    }
  });

  const sampleOptions = samples.map((s) => ({
    value: s.id,
    label: s.id,
  }));

  const handleUpdate = async () => {
    if (selectedSampleIds.length === 0) {
      setError("At least one sample must be selected");
      return;
    }

    try {
      await updateMutation.mutateAsync({ sampleIds: selectedSampleIds });
      setError("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update split");
    }
  };

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={`Edit Split: ${split.name}`}
      size="lg"
    >
      <Stack gap="md">
        <Group>
          <Badge
            color={
              split.type === "train"
                ? "blue"
                : split.type === "val"
                  ? "cyan"
                  : split.type === "test"
                    ? "grape"
                    : "yellow"
            }
          >
            {split.type}
          </Badge>
          <Text size="sm" c="dimmed">
            Current: {split.sampleCount} samples
          </Text>
        </Group>

        <MultiSelect
          label="Update Sample Selection"
          placeholder="Choose samples for this split"
          data={sampleOptions}
          value={selectedSampleIds}
          onChange={setSelectedSampleIds}
          searchable
          error={
            error && selectedSampleIds.length === 0
              ? "At least one sample required"
              : ""
          }
          required
        />

        <Text size="sm" c="dimmed">
          Selected {selectedSampleIds.length} of {samples.length} samples
        </Text>

        {error && selectedSampleIds.length > 0 && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} loading={updateMutation.isPending}>
            Update Split
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface FreezeButtonProps {
  datasetId: string;
  versionId: string;
  splitId: string;
}

function FreezeButton({ datasetId, versionId, splitId }: FreezeButtonProps) {
  const freezeMutation = useFreezeSplit(datasetId, versionId, splitId);

  const handleFreeze = async () => {
    if (
      window.confirm(
        "Are you sure you want to freeze this split? It will become immutable.",
      )
    ) {
      await freezeMutation.mutateAsync();
    }
  };

  return (
    <Button
      size="xs"
      variant="light"
      color="yellow"
      leftSection={<IconLock size={14} />}
      onClick={handleFreeze}
      loading={freezeMutation.isPending}
    >
      Freeze
    </Button>
  );
}
