import {
  Badge,
  Button,
  Card,
  Center,
  Grid,
  Group,
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
  IconRotate,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "@/data/services/api.service";
import { HITL_MAX_CONFIDENCE } from "@/shared/constants";
import type { QueueDocument } from "../hooks/useReviewQueue";
import { useReviewQueue } from "../hooks/useReviewQueue";

export const ReviewQueuePage: FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string | null>("pending");

  const pendingQueue = useReviewQueue({
    maxConfidence: HITL_MAX_CONFIDENCE,
    limit: 50,
    reviewStatus: "pending",
  });

  const reviewedQueue = useReviewQueue({
    maxConfidence: HITL_MAX_CONFIDENCE,
    limit: 50,
    reviewStatus: "reviewed",
  });

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

  const getAverageConfidence = (doc: QueueDocument) => {
    if (!doc.ocr_result?.fields) return 0;
    const fields = Object.values(doc.ocr_result.fields);
    if (fields.length === 0) return 0;
    const sum = fields.reduce((acc, field) => acc + (field.confidence || 0), 0);
    return sum / fields.length;
  };

  const handleStartSession = async (
    documentId: string,
    readOnly: boolean = false,
  ) => {
    try {
      if (readOnly) {
        navigate(`/review/${documentId}?readOnly=true`);
      } else {
        const session = await activeQueue.startSessionAsync(documentId);
        if (session?.id) {
          navigate(`/review/${session.id}`);
        }
      }
    } catch {
      // Session start failed; leave state unchanged
    }
  };

  const [reopeningSessionId, setReopeningSessionId] = useState<string | null>(null);

  const handleReopenSession = async (sessionId: string) => {
    setReopeningSessionId(sessionId);
    try {
      await apiService.post(`/hitl/sessions/${sessionId}/reopen`, {});
      notifications.show({
        title: "Session reopened",
        message: "Document returned to review queue",
        color: "green",
        autoClose: 3000,
      });
      // Refresh both queues
      queryClient.invalidateQueries({ queryKey: ["hitl-queue"] });
      queryClient.invalidateQueries({ queryKey: ["hitl-queue-stats"] });
    } catch {
      notifications.show({
        title: "Cannot reopen",
        message: "The reopen window may have expired or the dataset is frozen",
        color: "red",
        autoClose: 5000,
      });
    } finally {
      setReopeningSessionId(null);
    }
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

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>HITL Review Queue</Title>
        <Text c="dimmed" size="sm">
          Review and correct OCR results with low confidence scores
        </Text>
      </Stack>

      {activeQueue.stats && (
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Total Documents
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
                  Requires Review
                </Text>
                <Text size="xl" fw={700} c="orange">
                  {activeQueue.stats.requiresReview}
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Avg Confidence
                </Text>
                <Text size="xl" fw={700}>
                  {Math.round(activeQueue.stats.averageConfidence * 100)}%
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Reviewed Today
                </Text>
                <Text size="xl" fw={700} c="green">
                  {activeQueue.stats.reviewedToday}
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
                      All documents have been reviewed or have high confidence
                      scores
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
                    <Table.Th>Document</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Model</Table.Th>
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
                            {doc.original_filename}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" size="sm">
                            {doc.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {doc.model_id || "N/A"}
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
                      Documents will appear here after they have been reviewed
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
                    <Table.Th>Document</Table.Th>
                    <Table.Th>Reviewer</Table.Th>
                    <Table.Th>Reviewed Date</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Corrections</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {reviewedQueue.queue.map((doc) => {
                    return (
                      <Table.Tr key={doc.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {doc.original_filename}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {doc.lastSession?.reviewer_id || "N/A"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {doc.lastSession?.completed_at
                              ? new Date(
                                  doc.lastSession.completed_at,
                                ).toLocaleDateString()
                              : "N/A"}
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
                          <Group gap="xs">
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
                            {doc.lastSession?.id && (
                              <Button
                                size="xs"
                                variant="light"
                                color="orange"
                                leftSection={<IconRotate size={14} />}
                                onClick={() =>
                                  handleReopenSession(doc.lastSession!.id)
                                }
                                loading={
                                  reopeningSessionId === doc.lastSession.id
                                }
                              >
                                Reopen
                              </Button>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Card>
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};
