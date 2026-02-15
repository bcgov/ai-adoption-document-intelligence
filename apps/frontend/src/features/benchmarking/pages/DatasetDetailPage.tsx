import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Menu,
  Pagination,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconArchive,
  IconCheck,
  IconDotsVertical,
  IconEye,
  IconUpload,
} from "@tabler/icons-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { FileUploadDialog } from "../components/FileUploadDialog";
import { GroundTruthViewer } from "../components/GroundTruthViewer";
import { useDataset } from "../hooks/useDatasets";
import {
  useDatasetSamples,
  useDatasetVersions,
} from "../hooks/useDatasetVersions";

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { dataset, isLoading: isLoadingDataset } = useDataset(id || "");
  const {
    versions,
    isLoading: isLoadingVersions,
    publishVersion,
    archiveVersion,
  } = useDatasetVersions(id || "");

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [samplePage, setSamplePage] = useState(1);
  const [groundTruthViewerOpen, setGroundTruthViewerOpen] = useState(false);
  const [selectedGroundTruth, setSelectedGroundTruth] = useState<Record<
    string,
    unknown
  > | null>(null);

  const {
    samples,
    totalPages,
    isLoading: isLoadingSamples,
  } = useDatasetSamples(id || "", selectedVersionId || "", samplePage, 20);

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
        <Text c="dimmed">Dataset not found</Text>
      </Center>
    );
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "draft":
        return "yellow";
      case "published":
        return "green";
      case "archived":
        return "gray";
      default:
        return "blue";
    }
  };

  const handlePublish = (versionId: string) => {
    publishVersion(versionId);
  };

  const handleArchive = (versionId: string) => {
    archiveVersion(versionId);
  };

  const handleViewGroundTruth = async (sampleId: string) => {
    const sample = samples.find((s) => s.id === sampleId);
    if (sample?.groundTruth?.[0]?.path) {
      // For now, we'll show the sample metadata as ground truth preview
      // In a real implementation, we'd fetch the actual ground truth file
      setSelectedGroundTruth(sample.metadata || {});
      setGroundTruthViewerOpen(true);
    }
  };

  return (
    <>
      <Stack gap="lg">
        <Stack gap={2}>
          <Group justify="space-between">
            <Title order={2}>{dataset.name}</Title>
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload Files
            </Button>
          </Group>
          <Text c="dimmed" size="sm">
            {dataset.description || "No description"}
          </Text>
        </Stack>

        <Tabs
          value={selectedVersionId || "versions"}
          onChange={(value) => {
            if (value !== "versions") {
              setSelectedVersionId(value);
              setSamplePage(1);
            } else {
              setSelectedVersionId(null);
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="versions">Versions ({versions.length})</Tabs.Tab>
            {selectedVersionId && (
              <Tabs.Tab value={selectedVersionId}>Sample Preview</Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="versions" pt="md">
            {versions.length === 0 ? (
              <Card>
                <Center>
                  <Stack align="center" gap="md">
                    <Text c="dimmed">No versions yet</Text>
                    <Text size="sm" c="dimmed">
                      Upload files to create a new version
                    </Text>
                  </Stack>
                </Center>
              </Card>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Version</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Documents</Table.Th>
                    <Table.Th>Git Revision</Table.Th>
                    <Table.Th>Published</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {versions.map((version) => (
                    <Table.Tr
                      key={version.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedVersionId(version.id)}
                    >
                      <Table.Td>{version.version}</Table.Td>
                      <Table.Td>
                        <Badge color={getStatusBadgeColor(version.status)}>
                          {version.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{version.documentCount}</Table.Td>
                      <Table.Td>{version.gitRevision.substring(0, 8)}</Table.Td>
                      <Table.Td>
                        {version.publishedAt
                          ? new Date(version.publishedAt).toLocaleDateString()
                          : "-"}
                      </Table.Td>
                      <Table.Td>
                        {new Date(version.createdAt).toLocaleDateString()}
                      </Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Menu position="bottom-end">
                          <Menu.Target>
                            <Button size="xs" variant="subtle">
                              <IconDotsVertical size={16} />
                            </Button>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconEye size={16} />}
                              onClick={() => setSelectedVersionId(version.id)}
                            >
                              View Samples
                            </Menu.Item>
                            {version.status === "draft" && (
                              <Menu.Item
                                leftSection={<IconCheck size={16} />}
                                onClick={() => handlePublish(version.id)}
                              >
                                Publish
                              </Menu.Item>
                            )}
                            {version.status === "published" && (
                              <Menu.Item
                                leftSection={<IconArchive size={16} />}
                                onClick={() => handleArchive(version.id)}
                              >
                                Archive
                              </Menu.Item>
                            )}
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
                {isLoadingSamples ? (
                  <Center h={200}>
                    <Loader />
                  </Center>
                ) : samples.length === 0 ? (
                  <Card>
                    <Center>
                      <Text c="dimmed">No samples found</Text>
                    </Center>
                  </Card>
                ) : (
                  <>
                    <Table striped highlightOnHover>
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
                          <Table.Tr key={sample.id}>
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
                              <Button
                                size="xs"
                                variant="subtle"
                                leftSection={<IconEye size={14} />}
                                onClick={() => handleViewGroundTruth(sample.id)}
                              >
                                View
                              </Button>
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
                        />
                      </Center>
                    )}
                  </>
                )}
              </Stack>
            </Tabs.Panel>
          )}
        </Tabs>
      </Stack>

      <FileUploadDialog
        datasetId={id || ""}
        opened={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
      />

      <GroundTruthViewer
        groundTruth={selectedGroundTruth}
        opened={groundTruthViewerOpen}
        onClose={() => setGroundTruthViewerOpen(false)}
      />
    </>
  );
}
