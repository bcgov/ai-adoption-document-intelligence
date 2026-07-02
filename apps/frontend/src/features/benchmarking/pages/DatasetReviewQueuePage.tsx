import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconEye,
} from "@tabler/icons-react";
import { FC, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Center,
  DataTable,
  Grid,
  Loader,
  PanelCard,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from "../../../ui";
import {
  type DatasetReviewQueueDocument,
  useDatasetReviewQueue,
} from "../hooks/useDatasetReviewQueue";
import { useDataset } from "../hooks/useDatasets";

export const DatasetReviewQueuePage: FC = () => {
  const { id: datasetId, versionId } = useParams<{
    id: string;
    versionId: string;
  }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>("pending");
  const [startingDocId, setStartingDocId] = useState<string | null>(null);

  const { dataset } = useDataset(datasetId || "");

  const pendingQueue = useDatasetReviewQueue(datasetId || "", versionId || "", {
    limit: 50,
    reviewStatus: "pending",
  });

  const reviewedQueue = useDatasetReviewQueue(
    datasetId || "",
    versionId || "",
    { limit: 50, reviewStatus: "reviewed" },
  );

  const activeQueue = activeTab === "reviewed" ? reviewedQueue : pendingQueue;

  if (activeQueue.isLoading) {
    return (
      <Center h="70vh">
        <Loader size="lg" />
      </Center>
    );
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "green";
    if (confidence >= 0.7) return "yellow";
    return "red";
  };

  const getAverageConfidence = (doc: DatasetReviewQueueDocument) => {
    if (!doc.ocr_result?.fields) return 0;
    const fields = Object.values(doc.ocr_result.fields) as Array<{
      confidence?: number;
    }>;
    if (fields.length === 0) return 0;
    const sum = fields.reduce((acc, field) => acc + (field.confidence || 0), 0);
    return sum / fields.length;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "green";
      case "escalated":
        return "orange";
      case "skipped":
        return "gray";
      default:
        return "blue";
    }
  };

  const handleStartSession = async (
    documentId: string,
    readOnly: boolean = false,
  ) => {
    try {
      if (readOnly) {
        navigate(
          `/benchmarking/datasets/${datasetId}/versions/${versionId}/review/${documentId}?readOnly=true`,
        );
      } else {
        setStartingDocId(documentId);
        const session = await activeQueue.startSessionAsync(documentId);
        if (session?.id) {
          navigate(
            `/benchmarking/datasets/${datasetId}/versions/${versionId}/review/${session.id}`,
          );
        }
      }
    } catch {
      // Session start failed
    } finally {
      setStartingDocId(null);
    }
  };

  return (
    <Stack gap="lg">
      <Breadcrumbs>
        <Anchor onClick={() => navigate("/benchmarking/datasets")}>
          Datasets
        </Anchor>
        <Anchor onClick={() => navigate(`/benchmarking/datasets/${datasetId}`)}>
          {dataset?.name || "Dataset"}
        </Anchor>
        <Text>Ground truth review</Text>
      </Breadcrumbs>

      <Stack gap={2}>
        <Title order={2}>Ground truth review queue</Title>
        <Text c="dimmed" size="sm">
          Review OCR results to generate ground truth for dataset samples
        </Text>
      </Stack>

      {activeQueue.stats && (
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Total jobs
                </Text>
                <Text size="xl" fw={700}>
                  {activeQueue.stats.totalDocuments}
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Awaiting review
                </Text>
                <Text size="xl" fw={700} c="orange">
                  {activeQueue.stats.awaitingReview}
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Completed
                </Text>
                <Text size="xl" fw={700} c="green">
                  {activeQueue.stats.completed}
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Failed
                </Text>
                <Text size="xl" fw={700} c="red">
                  {activeQueue.stats.failed}
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      )}

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="pending" leftSection={<IconClock size={16} />}>
            Pending review ({pendingQueue.total})
          </Tabs.Tab>
          <Tabs.Tab value="reviewed" leftSection={<IconCheck size={16} />}>
            Reviewed ({reviewedQueue.total})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="pending" pt="md">
          {pendingQueue.queue.length === 0 ? (
            <PanelCard p="xl">
              <Center>
                <Stack align="center" gap="md">
                  <IconAlertCircle size={48} stroke={1.5} color="gray" />
                  <Stack gap={4} align="center">
                    <Text fw={600}>No documents pending review</Text>
                    <Text size="sm" c="dimmed">
                      Documents will appear here once OCR processing completes
                    </Text>
                  </Stack>
                </Stack>
              </Center>
            </PanelCard>
          ) : (
            <PanelCard p={0}>
              <DataTable striped highlightOnHover>
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Sample ID</DataTable.Th>
                    <DataTable.Th>Document</DataTable.Th>
                    <DataTable.Th>Avg confidence</DataTable.Th>
                    <DataTable.Th>Uploaded</DataTable.Th>
                    <DataTable.Th>Actions</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {pendingQueue.queue.map((doc) => {
                    const avgConfidence = getAverageConfidence(doc);
                    return (
                      <DataTable.Tr key={doc.id}>
                        <DataTable.Td>
                          <Text size="sm" fw={500}>
                            {doc.sampleId}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {doc.original_filename}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Badge
                            variant="light"
                            color={getConfidenceColor(avgConfidence)}
                            size="sm"
                          >
                            {Math.round(avgConfidence * 100)}%
                          </Badge>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconEye size={14} />}
                            onClick={() => handleStartSession(doc.id, false)}
                            loading={startingDocId === doc.id}
                            disabled={
                              startingDocId !== null && startingDocId !== doc.id
                            }
                          >
                            Review
                          </Button>
                        </DataTable.Td>
                      </DataTable.Tr>
                    );
                  })}
                </DataTable.Tbody>
              </DataTable>
            </PanelCard>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="reviewed" pt="md">
          {reviewedQueue.queue.length === 0 ? (
            <PanelCard p="xl">
              <Center>
                <Stack align="center" gap="md">
                  <IconAlertCircle size={48} stroke={1.5} color="gray" />
                  <Stack gap={4} align="center">
                    <Text fw={600}>No reviewed documents</Text>
                    <Text size="sm" c="dimmed">
                      Documents will appear here after review is completed
                    </Text>
                  </Stack>
                </Stack>
              </Center>
            </PanelCard>
          ) : (
            <PanelCard p={0}>
              <DataTable striped highlightOnHover>
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Sample ID</DataTable.Th>
                    <DataTable.Th>Document</DataTable.Th>
                    <DataTable.Th>Reviewer</DataTable.Th>
                    <DataTable.Th>Status</DataTable.Th>
                    <DataTable.Th>Corrections</DataTable.Th>
                    <DataTable.Th>Actions</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {reviewedQueue.queue.map((doc) => (
                    <DataTable.Tr key={doc.id}>
                      <DataTable.Td>
                        <Text size="sm" fw={500}>
                          {doc.sampleId}
                        </Text>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Text size="sm" c="dimmed">
                          {doc.original_filename}
                        </Text>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Text size="sm">
                          {doc.lastSession?.reviewer_id || "N/A"}
                        </Text>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Badge
                          variant="light"
                          color={getStatusColor(doc.lastSession?.status || "")}
                          size="sm"
                        >
                          {doc.lastSession?.status || "N/A"}
                        </Badge>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Text size="sm">
                          {doc.lastSession?.corrections_count || 0}
                        </Text>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconEye size={14} />}
                          onClick={() =>
                            handleStartSession(
                              doc.lastSession?.id || doc.id,
                              true,
                            )
                          }
                          disabled={!doc.lastSession?.id}
                        >
                          View
                        </Button>
                      </DataTable.Td>
                    </DataTable.Tr>
                  ))}
                </DataTable.Tbody>
              </DataTable>
            </PanelCard>
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};
