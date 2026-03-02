import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  Pagination,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconDotsVertical,
  IconEye,
  IconFileCheck,
  IconLock,
  IconPlus,
  IconShieldCheck,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiService } from "@/data/services/api.service";
import { CreateDatasetFromHitlDialog } from "../components/CreateDatasetFromHitlDialog";
import { FileUploadDialog } from "../components/FileUploadDialog";
import { GroundTruthGenerationPanel } from "../components/GroundTruthGenerationPanel";
import { SampleDetailViewer } from "../components/SampleDetailViewer";
import { SplitManagement } from "../components/SplitManagement";
import { ValidationReport } from "../components/ValidationReport";
import { useDataset } from "../hooks/useDatasets";
import { useValidateDataset } from "../hooks/useDatasetValidation";
import {
  useDatasetSamples,
  useDatasetVersions,
} from "../hooks/useDatasetVersions";

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { dataset, isLoading: isLoadingDataset } = useDataset(id || "");
  const {
    versions,
    isLoading: isLoadingVersions,
    createVersion,
    isCreatingVersion,
    deleteVersion,
    isDeletingVersion,
    deleteVersionError,
    freezeVersion,
    isFreezingVersion,
    deleteSample,
    isDeletingSample,
    deletingSampleId,
  } = useDatasetVersions(id || "");

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadVersionId, setUploadVersionId] = useState<string | null>(null);
  const [uploadVersionLabel, setUploadVersionLabel] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<string>("versions");
  const [samplePage, setSamplePage] = useState(1);
  const [
    groundTruthViewerOpen,
    { open: openGroundTruthViewer, close: closeGroundTruthViewer },
  ] = useDisclosure(false);
  const [selectedGroundTruth, setSelectedGroundTruth] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedSample, setSelectedSample] = useState<{
    id: string;
    inputs: Array<{ path: string; mimeType: string }>;
    groundTruth: Array<{ path: string; format: string }>;
  } | null>(null);
  const [isLoadingGroundTruth, setIsLoadingGroundTruth] = useState(false);
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [deleteVersionDialogOpen, setDeleteVersionDialogOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [newVersionDialogOpen, setNewVersionDialogOpen] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [hitlVersionDialogOpen, setHitlVersionDialogOpen] = useState(false);

  const {
    samples,
    totalPages,
    isLoading: isLoadingSamples,
  } = useDatasetSamples(id || "", selectedVersionId || "", samplePage, 20);

  const selectedVersion = selectedVersionId
    ? versions.find((v) => v.id === selectedVersionId)
    : null;

  const {
    mutate: validateDataset,
    data: validationResult,
    isPending: isValidating,
  } = useValidateDataset(id || "");

  if (isLoadingDataset || isLoadingVersions) {
    return (
      <Center h={400}>
        <Loader />
      </Center>
    );
  }

  if (!dataset) {
    return (
      <Center h={400}>
        <Stack align="center" gap="sm">
          <Text c="dimmed">Dataset not found</Text>
          {id && <Text size="sm" c="dimmed">ID: {id}</Text>}
        </Stack>
      </Center>
    );
  }

  const handleDeleteVersionClick = (versionId: string, versionLabel: string) => {
    setVersionToDelete({ id: versionId, label: versionLabel });
    setDeleteVersionDialogOpen(true);
  };

  const handleDeleteVersionConfirm = () => {
    if (!versionToDelete) return;
    deleteVersion(versionToDelete.id);
    if (selectedVersionId === versionToDelete.id) {
      setSelectedVersionId(null);
      setActiveTab("versions");
    }
    setDeleteVersionDialogOpen(false);
    setVersionToDelete(null);
  };

  const handleDeleteVersionCancel = () => {
    setDeleteVersionDialogOpen(false);
    setVersionToDelete(null);
  };

  const handleNewVersion = () => {
    setNewVersionName("");
    setNewVersionDialogOpen(true);
  };

  const handleNewVersionConfirm = async () => {
    const version = await createVersion(
      newVersionName.trim() ? { name: newVersionName.trim() } : undefined,
    );
    setNewVersionDialogOpen(false);
    setUploadVersionId(version.id);
    setUploadVersionLabel(version.version);
    setUploadDialogOpen(true);
  };

  const handleUploadToVersion = (versionId: string) => {
    const version = versions.find((v) => v.id === versionId);
    setUploadVersionId(versionId);
    setUploadVersionLabel(version?.version || null);
    setUploadDialogOpen(true);
  };

  const handleDeleteSample = (versionId: string, sampleId: string) => {
    deleteSample({ versionId, sampleId });
  };

  const handleValidate = (versionId: string) => {
    setValidationDialogOpen(true);
    validateDataset({ versionId });
  };

  const handleViewGroundTruth = async (sampleId: string) => {
    const sample = samples.find((s) => s.id === sampleId);
    if (!sample) return;

    // Set sample info and open the viewer immediately
    setSelectedSample({
      id: sample.id,
      inputs: sample.inputs,
      groundTruth: sample.groundTruth,
    });
    setSelectedGroundTruth(null);
    openGroundTruthViewer();

    // Fetch ground truth content in the background if available
    if (sample.groundTruth?.[0]?.path && selectedVersionId) {
      setIsLoadingGroundTruth(true);
      try {
        const response = await apiService.get<{
          sampleId: string;
          content: Record<string, unknown>;
          path: string;
          format: string;
        }>(
          `/benchmark/datasets/${id}/versions/${selectedVersionId}/samples/${sampleId}/ground-truth`,
        );
        setSelectedGroundTruth(response.data.content);
      } catch (error) {
        console.error("Error fetching ground truth:", error);
      } finally {
        setIsLoadingGroundTruth(false);
      }
    }
  };

  return (
    <>
      <Stack gap="lg">
        <Stack gap={2}>
          <Group justify="space-between">
            <Group gap="sm" align="center">
              <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => navigate("/benchmarking/datasets")}
                data-testid="back-to-datasets-btn"
              >
                Back
              </Button>
              <Title order={2} data-testid="dataset-name-title">
                {dataset.name}
              </Title>
            </Group>
            <Group gap="sm">
              <Button
                variant="light"
                leftSection={<IconFileCheck size={16} />}
                onClick={() => setHitlVersionDialogOpen(true)}
                data-testid="add-version-from-hitl-btn"
              >
                From Verified Documents
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={handleNewVersion}
                loading={isCreatingVersion}
                data-testid="new-version-btn"
              >
                New Version
              </Button>
            </Group>
          </Group>
          <Text c="dimmed" size="sm" data-testid="dataset-description">
            {dataset.description || "No description"}
          </Text>
        </Stack>

        <Tabs
          value={activeTab}
          onChange={(value) => {
            setActiveTab(value || "versions");
            if (value !== "versions") {
              // Extract versionId from tab value (handle "splits-" or "gt-" prefix)
              const versionId = value?.startsWith("splits-")
                ? value.substring(7)
                : value?.startsWith("gt-")
                  ? value.substring(3)
                  : value;
              if (versionId && versionId !== selectedVersionId) {
                setSelectedVersionId(versionId);
                setSamplePage(1);
              }
            } else {
              setSelectedVersionId(null);
              setSamplePage(1);
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="versions" data-testid="versions-tab">
              Versions ({versions.length})
            </Tabs.Tab>
            {selectedVersionId && (
              <Tabs.Tab value={selectedVersionId} data-testid="sample-preview-tab">
                Sample Preview
              </Tabs.Tab>
            )}
            {selectedVersionId && (
              <Tabs.Tab value={`splits-${selectedVersionId}`} data-testid="splits-tab">
                Splits
              </Tabs.Tab>
            )}
            {selectedVersionId && (
              <Tabs.Tab value={`gt-${selectedVersionId}`} data-testid="ground-truth-tab">
                Ground Truth
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="versions" pt="md">
            {versions.length === 0 ? (
              <Card>
                <Center>
                  <Stack align="center" gap="md">
                    <Text c="dimmed" data-testid="no-versions-message">No versions yet</Text>
                    <Text size="sm" c="dimmed">
                      Click &quot;New Version&quot; to create a version and upload files
                    </Text>
                  </Stack>
                </Center>
              </Card>
            ) : (
              <Table striped highlightOnHover data-testid="versions-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Version</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Documents</Table.Th>
                    <Table.Th>Storage Prefix</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {versions.map((version) => (
                    <Table.Tr
                      key={version.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setSelectedVersionId(version.id);
                        setActiveTab(version.id);
                      }}
                      data-testid={`version-row-${version.id}`}
                    >
                      <Table.Td>{version.version}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c={version.name ? undefined : "dimmed"}>
                          {version.name || "-"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={version.frozen ? "gray" : "green"}
                          variant="light"
                          leftSection={version.frozen ? <IconLock size={12} /> : undefined}
                        >
                          {version.frozen ? "Frozen" : "Editable"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{version.documentCount}</Table.Td>
                      <Table.Td>{version.storagePrefix ? version.storagePrefix.substring(0, 8) : "-"}</Table.Td>
                      <Table.Td>
                        {new Date(version.createdAt).toLocaleDateString()}
                      </Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Menu position="bottom-end">
                          <Menu.Target>
                            <Button size="xs" variant="subtle" data-testid={`version-actions-btn-${version.id}`}>
                              <IconDotsVertical size={16} />
                            </Button>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconEye size={16} />}
                              onClick={() => {
                                setSelectedVersionId(version.id);
                                setActiveTab(version.id);
                              }}
                              data-testid={`view-samples-menu-item-${version.id}`}
                            >
                              View Samples
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconUpload size={16} />}
                              onClick={() => handleUploadToVersion(version.id)}
                              disabled={version.frozen}
                              data-testid={`upload-files-menu-item-${version.id}`}
                            >
                              Upload Files
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconShieldCheck size={16} />}
                              onClick={() => handleValidate(version.id)}
                              data-testid={`validate-menu-item-${version.id}`}
                            >
                              Validate
                            </Menu.Item>
                            {!version.frozen && (
                              <Menu.Item
                                leftSection={<IconLock size={16} />}
                                onClick={() => freezeVersion(version.id)}
                                disabled={isFreezingVersion}
                                data-testid={`freeze-version-menu-item-${version.id}`}
                              >
                                Freeze Version
                              </Menu.Item>
                            )}
                            <Menu.Divider />
                            <Menu.Item
                              leftSection={<IconTrash size={16} />}
                              color="red"
                              onClick={() => handleDeleteVersionClick(version.id, version.version)}
                              disabled={version.frozen || isDeletingVersion}
                              data-testid={`delete-version-menu-item-${version.id}`}
                            >
                              Delete Version
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>

          {selectedVersionId && (
            <Tabs.Panel value={selectedVersionId} pt="md">
              <Stack gap="md">
                <Group justify="flex-end">
                  {!selectedVersion?.frozen && (
                    <Button
                      leftSection={<IconUpload size={16} />}
                      variant="light"
                      onClick={() => handleUploadToVersion(selectedVersionId)}
                      data-testid="sample-preview-upload-btn"
                    >
                      Upload Files
                    </Button>
                  )}
                  {selectedVersion?.frozen && (
                    <Badge color="gray" variant="light" leftSection={<IconLock size={12} />}>
                      Frozen
                    </Badge>
                  )}
                </Group>
                {isLoadingSamples ? (
                  <Center h={200}>
                    <Loader />
                  </Center>
                ) : samples.length === 0 ? (
                  <Card>
                    <Center>
                      <Text c="dimmed" data-testid="no-samples-message">No samples found</Text>
                    </Center>
                  </Card>
                ) : (
                  <>
                    <Table striped highlightOnHover data-testid="samples-table">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Sample ID</Table.Th>
                          <Table.Th>Input Files</Table.Th>
                          <Table.Th>Ground Truth</Table.Th>
                          <Table.Th>Metadata</Table.Th>
                          <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {samples.map((sample) => (
                          <Table.Tr key={sample.id} data-testid={`sample-row-${sample.id}`}>
                            <Table.Td>{sample.id}</Table.Td>
                            <Table.Td>
                              {sample.inputs.map((input, idx) => (
                                <Text key={idx} size="sm">
                                  {input.path}
                                </Text>
                              ))}
                            </Table.Td>
                            <Table.Td>
                              {sample.groundTruth.map((gt, idx) => (
                                <Text key={idx} size="sm">
                                  {gt.path}
                                </Text>
                              ))}
                            </Table.Td>
                            <Table.Td>
                              {sample.metadata ? (
                                <Text size="sm" c="dimmed">
                                  {Object.keys(sample.metadata).length} field(s)
                                </Text>
                              ) : (
                                "-"
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  leftSection={<IconEye size={14} />}
                                  onClick={() => handleViewGroundTruth(sample.id)}
                                  data-testid={`view-ground-truth-btn-${sample.id}`}
                                >
                                  View
                                </Button>
                                {!selectedVersion?.frozen && (
                                  <Button
                                    size="xs"
                                    variant="subtle"
                                    color="red"
                                    leftSection={<IconTrash size={14} />}
                                    onClick={() =>
                                      handleDeleteSample(
                                        selectedVersionId!,
                                        sample.id,
                                      )
                                    }
                                    loading={isDeletingSample && deletingSampleId === sample.id}
                                    data-testid={`delete-sample-btn-${sample.id}`}
                                  >
                                    Delete
                                  </Button>
                                )}
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>

                    {totalPages > 1 && (
                      <Center>
                        <Pagination
                          value={samplePage}
                          onChange={setSamplePage}
                          total={totalPages}
                          data-testid="samples-pagination"
                        />
                      </Center>
                    )}
                  </>
                )}
              </Stack>
            </Tabs.Panel>
          )}

          {selectedVersionId && (
            <Tabs.Panel value={`splits-${selectedVersionId}`} pt="md">
              <SplitManagement
                datasetId={id || ""}
                versionId={selectedVersionId}
                samples={samples}
              />
            </Tabs.Panel>
          )}

          {selectedVersionId && (
            <Tabs.Panel value={`gt-${selectedVersionId}`} pt="md">
              <GroundTruthGenerationPanel
                datasetId={id || ""}
                versionId={selectedVersionId}
              />
            </Tabs.Panel>
          )}
        </Tabs>
      </Stack>

      <FileUploadDialog
        datasetId={id || ""}
        versionId={uploadVersionId || ""}
        versionLabel={uploadVersionLabel || undefined}
        opened={uploadDialogOpen}
        onClose={() => {
          setUploadDialogOpen(false);
          setUploadVersionId(null);
          setUploadVersionLabel(null);
        }}
      />

      <SampleDetailViewer
        sampleId={selectedSample?.id ?? null}
        datasetId={id || ""}
        versionId={selectedVersionId || ""}
        inputs={selectedSample?.inputs ?? []}
        groundTruthFiles={selectedSample?.groundTruth ?? []}
        groundTruthContent={selectedGroundTruth}
        isLoadingGroundTruth={isLoadingGroundTruth}
        opened={groundTruthViewerOpen}
        onClose={() => {
          closeGroundTruthViewer();
          setSelectedSample(null);
          setSelectedGroundTruth(null);
        }}
      />

      <Modal
        opened={deleteVersionDialogOpen}
        onClose={handleDeleteVersionCancel}
        title="Delete Version"
        centered
        data-testid="delete-version-confirm-dialog"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete version {versionToDelete?.label}? This action cannot be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" onClick={handleDeleteVersionCancel} data-testid="delete-version-cancel-btn">
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteVersionConfirm}
              loading={isDeletingVersion}
              data-testid="delete-version-confirm-btn"
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={validationDialogOpen}
        onClose={() => setValidationDialogOpen(false)}
        title="Dataset Validation Report"
        size="xl"
      >
        {isValidating ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : validationResult?.data ? (
          <ValidationReport validation={validationResult.data} />
        ) : (
          <Text c="dimmed">No validation results available</Text>
        )}
      </Modal>

      <Modal
        opened={newVersionDialogOpen}
        onClose={() => setNewVersionDialogOpen(false)}
        title="New Version"
        centered
        data-testid="new-version-dialog"
      >
        <Stack gap="md">
          <TextInput
            label="Version name"
            description="Optional name to identify this version (e.g., 'Q4 invoices')"
            placeholder="e.g., Q4 invoices"
            value={newVersionName}
            onChange={(e) => setNewVersionName(e.currentTarget.value)}
            data-testid="new-version-name-input"
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              onClick={() => setNewVersionDialogOpen(false)}
              data-testid="new-version-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              onClick={handleNewVersionConfirm}
              loading={isCreatingVersion}
              data-testid="new-version-confirm-btn"
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      {id && (
        <CreateDatasetFromHitlDialog
          opened={hitlVersionDialogOpen}
          onClose={() => setHitlVersionDialogOpen(false)}
          existingDatasetId={id}
        />
      )}
    </>
  );
}
