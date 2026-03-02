import {
  Badge,
  Breadcrumbs,
  Anchor,
  Button,
  Card,
  Center,
  Grid,
  Loader,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconEye,
} from "@tabler/icons-react";
import { FC, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDataset } from "../hooks/useDatasets";
import {
  useDatasetReviewQueue,
  type DatasetReviewQueueDocument,
} from "../hooks/useDatasetReviewQueue";

export const DatasetReviewQueuePage: FC = () => {
  const { id: datasetId, versionId } = useParams<{
    id: string;
    versionId: string;
  }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>("pending");

  const { dataset } = useDataset(datasetId || "");

  const pendingQueue = useDatasetReviewQueue(
    datasetId || "",
    versionId || "",
    { limit: 50, reviewStatus: "pending" },
  );

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
    const sum = fields.reduce(
      (acc, field) => acc + (field.confidence || 0),
      0,
    );
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
        const session = await activeQueue.startSessionAsync(documentId);
        if (session?.id) {
          navigate(
            `/benchmarking/datasets/${datasetId}/versions/${versionId}/review/${session.id}`,
          );
        }
      }
    } catch {
      // Session start failed
    }
  };

  return (
    <Stack gap="lg">
      <Breadcrumbs>
        <Anchor onClick={() => navigate("/benchmarking/datasets")}>
          Datasets
        </Anchor>
        <Anchor
          onClick={() => navigate(`/benchmarking/datasets/${datasetId}`)}
        >
          {dataset?.name || "Dataset"}
        </Anchor>
        <Text>Ground Truth Review</Text>
      </Breadcrumbs>

      <Stack gap={2}>
        <Title order={2}>Ground Truth Review Queue</Title>
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
                  Total Jobs
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
                  Awaiting Review
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
            Pending Review ({pendingQueue.total})
          </Tabs.Tab>
          <Tabs.Tab value="reviewed" leftSection={<IconCheck size={16} />}>
            Reviewed ({reviewedQueue.total})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="pending" pt="md">
          {pendingQueue.queue.length === 0 ? (
            <Card withBorder p="xl">
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
            </Card>
          ) : (
            <Card withBorder padding={0}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Sample ID</Table.Th>
                    <Table.Th>Document</Table.Th>
                    <Table.Th>Avg Confidence</Table.Th>
                    <Table.Th>Uploaded</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pendingQueue.queue.map((doc) => {
                    const avgConfidence = getAverageConfidence(doc);
                    return (
                      <Table.Tr key={doc.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {doc.sampleId}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {doc.original_filename}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            color={getConfidenceColor(avgConfidence)}
                            size="sm"
                          >
                            {Math.round(avgConfidence * 100)}%
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconEye size={14} />}
                            onClick={() => handleStartSession(doc.id, false)}
                            loading={pendingQueue.isStartingSession}
                          >
                            Review
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Card>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="reviewed" pt="md">
          {reviewedQueue.queue.length === 0 ? (
            <Card withBorder p="xl">
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
            </Card>
          ) : (
            <Card withBorder padding={0}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Sample ID</Table.Th>
                    <Table.Th>Document</Table.Th>
                    <Table.Th>Reviewer</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Corrections</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {reviewedQueue.queue.map((doc) => (
                    <Table.Tr key={doc.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {doc.sampleId}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {doc.original_filename}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {doc.lastSession?.reviewer_id || "N/A"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={getStatusColor(
                            doc.lastSession?.status || "",
                          )}
                          size="sm"
                        >
                          {doc.lastSession?.status || "N/A"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {doc.lastSession?.corrections_count || 0}
                        </Text>
                      </Table.Td>
                      <Table.Td>
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
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};
