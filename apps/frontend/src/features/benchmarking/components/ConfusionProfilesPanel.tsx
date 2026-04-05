import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEye, IconTrash } from "@tabler/icons-react";
import { type JSX, useState } from "react";
import { useTemplateModels } from "@/features/annotation/template-models/hooks/useTemplateModels";
import {
  type ConfusionProfile,
  useConfusionProfiles,
  useDeleteProfile,
  useDeriveProfile,
  useUpdateProfile,
} from "../hooks/useConfusionProfiles";
import { ConfusionMatrixEditor } from "./ConfusionMatrixEditor";

interface ConfusionProfilesPanelProps {
  groupId: string;
}

function sumMatrix(matrix: Record<string, Record<string, number>>): number {
  let total = 0;
  for (const confusions of Object.values(matrix)) {
    for (const count of Object.values(confusions)) {
      total += count;
    }
  }
  return total;
}

export function ConfusionProfilesPanel({
  groupId,
}: ConfusionProfilesPanelProps): JSX.Element {
  const { profiles, isLoading } = useConfusionProfiles(groupId);
  const deriveMutation = useDeriveProfile(groupId);
  const deleteMutation = useDeleteProfile(groupId);
  const updateMutation = useUpdateProfile(groupId);
  const { templateModels } = useTemplateModels();

  const [deriveOpen, setDeriveOpen] = useState(false);
  const [deriveName, setDeriveName] = useState("");
  const [deriveDescription, setDeriveDescription] = useState("");
  const [deriveScope, setDeriveScope] = useState("");
  const [selectedTemplateModelIds, setSelectedTemplateModelIds] = useState<
    string[]
  >([]);
  const [benchmarkRunIdsText, setBenchmarkRunIdsText] = useState("");
  const [deriveError, setDeriveError] = useState<string | null>(null);

  const [editorProfile, setEditorProfile] = useState<ConfusionProfile | null>(
    null,
  );

  const handleDeriveOpen = () => {
    setDeriveName("");
    setDeriveDescription("");
    setDeriveScope("");
    setSelectedTemplateModelIds([]);
    setBenchmarkRunIdsText("");
    setDeriveError(null);
    setDeriveOpen(true);
  };

  const handleDeriveSubmit = () => {
    if (!deriveName.trim()) {
      setDeriveError("Name is required.");
      return;
    }
    setDeriveError(null);
    const sources: {
      templateModelIds?: string[];
      benchmarkRunIds?: string[];
    } = {};
    if (selectedTemplateModelIds.length > 0) {
      sources.templateModelIds = selectedTemplateModelIds;
    }
    if (benchmarkRunIdsText.trim()) {
      sources.benchmarkRunIds = benchmarkRunIdsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    deriveMutation.mutate(
      {
        name: deriveName.trim(),
        description: deriveDescription.trim() || undefined,
        scope: deriveScope.trim() || undefined,
        sources: Object.keys(sources).length > 0 ? sources : undefined,
      },
      {
        onSuccess: () => {
          setDeriveOpen(false);
          notifications.show({
            title: "Profile Derived",
            message: "Confusion profile has been derived successfully.",
            color: "green",
          });
        },
        onError: (err) => {
          setDeriveError(
            err instanceof Error
              ? err.message
              : "Failed to derive confusion profile.",
          );
        },
      },
    );
  };

  const handleDelete = (profileId: string) => {
    deleteMutation.mutate(profileId, {
      onSuccess: () => {
        notifications.show({
          title: "Profile Deleted",
          message: "Confusion profile has been deleted.",
          color: "green",
        });
      },
      onError: () => {
        notifications.show({
          title: "Error",
          message: "Failed to delete confusion profile.",
          color: "red",
        });
      },
    });
  };

  const handleEditorSave = (matrix: Record<string, Record<string, number>>) => {
    if (!editorProfile) return;
    updateMutation.mutate(
      { profileId: editorProfile.id, dto: { matrix } },
      {
        onSuccess: () => {
          setEditorProfile(null);
          notifications.show({
            title: "Profile Updated",
            message: "Confusion matrix has been saved.",
            color: "green",
          });
        },
        onError: () => {
          notifications.show({
            title: "Error",
            message: "Failed to update confusion profile.",
            color: "red",
          });
        },
      },
    );
  };

  if (isLoading) {
    return <Loader />;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Confusion Profiles</Text>
        <Button onClick={handleDeriveOpen}>Derive new profile</Button>
      </Group>

      {profiles.length === 0 ? (
        <Text c="dimmed">
          No confusion profiles yet. Derive one from HITL correction data.
        </Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Scope</Table.Th>
              <Table.Th>Confusions</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {profiles.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.name}</Table.Td>
                <Table.Td>{p.scope ?? "-"}</Table.Td>
                <Table.Td>{sumMatrix(p.matrix)}</Table.Td>
                <Table.Td>
                  {new Date(p.createdAt).toLocaleDateString()}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <ActionIcon
                      variant="subtle"
                      onClick={() => setEditorProfile(p)}
                      aria-label="View profile"
                    >
                      <IconEye size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => handleDelete(p.id)}
                      loading={deleteMutation.isPending}
                      aria-label="Delete profile"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={deriveOpen}
        onClose={() => setDeriveOpen(false)}
        title="Derive Confusion Profile"
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            required
            value={deriveName}
            onChange={(e) => setDeriveName(e.currentTarget.value)}
          />
          <TextInput
            label="Description"
            value={deriveDescription}
            onChange={(e) => setDeriveDescription(e.currentTarget.value)}
          />
          <TextInput
            label="Scope"
            placeholder="e.g. numeric, general"
            value={deriveScope}
            onChange={(e) => setDeriveScope(e.currentTarget.value)}
          />
          <Text size="sm" c="dimmed">
            Optionally scope the data sources. If none selected, all HITL
            corrections in the group are used.
          </Text>
          <MultiSelect
            label="Template Models"
            placeholder="All template models"
            data={templateModels.map((m) => ({ value: m.id, label: m.name }))}
            value={selectedTemplateModelIds}
            onChange={setSelectedTemplateModelIds}
            clearable
            searchable
          />
          <TextInput
            label="Benchmark Run IDs"
            placeholder="e.g. id1, id2, id3"
            value={benchmarkRunIdsText}
            onChange={(e) => setBenchmarkRunIdsText(e.currentTarget.value)}
          />
          {deriveError && (
            <Text c="red" size="sm">
              {deriveError}
            </Text>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setDeriveOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={deriveMutation.isPending}
              onClick={handleDeriveSubmit}
            >
              Derive
            </Button>
          </Group>
        </Stack>
      </Modal>

      {editorProfile && (
        <ConfusionMatrixEditor
          profile={editorProfile}
          onSave={handleEditorSave}
          onClose={() => setEditorProfile(null)}
        />
      )}
    </Stack>
  );
}
