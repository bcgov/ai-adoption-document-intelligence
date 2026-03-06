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
import { useEffect, useState } from "react";
import type { ManifestSample } from "../hooks/useDatasetVersions";
import { useAllSamples } from "../hooks/useDatasetVersions";
import {
  type CreateSplitRequest,
  type Split,
  type SplitType,
  useCreateSplit,
  useFreezeSplit,
  useSplit,
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
    <Stack gap="md" data-testid="split-management-container">
      <Group justify="space-between">
        <Title order={3} data-testid="splits-title">Dataset Splits</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setCreateDialogOpen(true)}
          data-testid="create-split-btn"
        >
          Create Split
        </Button>
      </Group>

      {splits && splits.length > 0 ? (
        <Card withBorder data-testid="splits-table-card">
          <Table striped highlightOnHover data-testid="splits-table">
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
                <Table.Tr key={split.id} data-testid={`split-row-${split.id}`}>
                  <Table.Td data-testid={`split-name-${split.id}`}>{split.name}</Table.Td>
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
                      data-testid={`split-type-badge-${split.id}`}
                    >
                      {split.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td data-testid={`split-sample-count-${split.id}`}>{split.sampleCount}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={split.frozen ? "gray" : "green"}
                      data-testid={`split-status-badge-${split.id}`}
                    >
                      {split.frozen ? "Frozen" : "Editable"}
                    </Badge>
                  </Table.Td>
                  <Table.Td data-testid={`split-created-${split.id}`}>
                    {new Date(split.createdAt).toLocaleDateString()}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {!split.frozen && (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => setEditingSplit(split)}
                          data-testid={`edit-split-btn-${split.id}`}
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
        <Card withBorder data-testid="splits-empty-state">
          <Stack align="center" gap="md" py="xl">
            <IconLockOpen size={48} style={{ opacity: 0.5 }} />
            <Text c="dimmed" data-testid="no-splits-message">No splits defined yet</Text>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateDialogOpen(true)}
              data-testid="create-first-split-btn"
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

  // Fetch all samples for the multiselect (not just the paginated view)
  const { samples: allSamples, isLoading: isLoadingAllSamples } = useAllSamples(datasetId, versionId);

  const sampleOptions = allSamples.map((s) => ({
    value: s.id,
    label: s.id,
  }));

  const validateSplitName = (splitName: string): string | null => {
    if (!splitName.trim()) {
      return "Split name is required";
    }
    // Allow alphanumeric, hyphens, underscores, and dots
    const validNamePattern = /^[a-zA-Z0-9\-_.]+$/;
    if (!validNamePattern.test(splitName.trim())) {
      return "Split name contains invalid characters. Use only letters, numbers, hyphens, underscores, and dots.";
    }
    return null;
  };

  const handleCreate = async () => {
    try {
      const nameError = validateSplitName(name);
      if (nameError) {
        setError(nameError);
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
    <Modal
      opened={open}
      onClose={onClose}
      title="Create Split"
      size="lg"
      closeOnClickOutside={false}
      closeOnEscape={false}
      data-testid="create-split-dialog"
    >
      <Stack gap="md">
        <TextInput
          label="Split Name"
          placeholder="e.g., train-v1, golden-regression"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          error={error && (error.toLowerCase().includes("name") || error.toLowerCase().includes("invalid") || error.toLowerCase().includes("character")) ? error : ""}
          required
          data-testid="split-name-input"
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
          data-testid="split-type-select"
        />

        <MultiSelect
          label="Select Samples"
          placeholder="Choose samples for this split"
          data={sampleOptions}
          value={selectedSampleIds}
          onChange={setSelectedSampleIds}
          searchable
          disabled={isLoadingAllSamples}
          error={
            error && selectedSampleIds.length === 0
              ? "At least one sample required"
              : ""
          }
          required
          data-testid="split-samples-multiselect"
        />

        <Text size="sm" c="dimmed" data-testid="selected-samples-count">
          Selected {selectedSampleIds.length} of {allSamples.length} samples
        </Text>

        {error && !(!name.trim() || selectedSampleIds.length === 0) && (
          <Text c="red" size="sm" data-testid="create-split-error">
            {error}
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            onClick={onClose}
            data-testid="create-split-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCreate();
            }}
            loading={createMutation.isPending}
            data-testid="create-split-submit-btn"
          >
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

  const updateMutation = useUpdateSplit(datasetId, versionId, split.id);

  // Fetch the split details to get current sample IDs
  const { data: splitDetail } = useSplit(
    open ? datasetId : undefined,
    open ? versionId : undefined,
    open ? split.id : undefined,
  );

  // Fetch all samples for the multiselect (not just the paginated view)
  const { samples: allSamples, isLoading: isLoadingAllSamples } = useAllSamples(datasetId, versionId);

  // Load current sample IDs when split details are fetched
  useEffect(() => {
    if (splitDetail?.data?.sampleIds) {
      setSelectedSampleIds(splitDetail.data.sampleIds);
    }
  }, [splitDetail]);

  const sampleOptions = allSamples.map((s) => ({
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
      data-testid="edit-split-dialog"
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
            data-testid="edit-split-type-badge"
          >
            {split.type}
          </Badge>
          <Text size="sm" c="dimmed" data-testid="edit-split-current-count">
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
          disabled={isLoadingAllSamples}
          error={
            error && selectedSampleIds.length === 0
              ? "At least one sample required"
              : ""
          }
          required
          data-testid="edit-split-samples-multiselect"
        />

        <Text size="sm" c="dimmed" data-testid="edit-split-selected-count">
          Selected {selectedSampleIds.length} of {allSamples.length} samples
        </Text>

        {error && selectedSampleIds.length > 0 && (
          <Text c="red" size="sm" data-testid="edit-split-error">
            {error}
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            onClick={onClose}
            data-testid="edit-split-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            loading={updateMutation.isPending}
            data-testid="edit-split-submit-btn"
          >
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
        "Are you sure you want to freeze this split? It will become immutable. This action cannot be undone.",
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
      data-testid={`freeze-split-btn-${splitId}`}
    >
      Freeze
    </Button>
  );
}
