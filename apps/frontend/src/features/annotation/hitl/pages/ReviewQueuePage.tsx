import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconEye,
  IconRotate,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "@/data/services/api.service";
import { HITL_MAX_CONFIDENCE } from "@/shared/constants";
import {
  Badge,
  Button,
  Center,
  DataTable,
  Group,
  Loader,
  notifications,
  PageHeader,
  PanelCard,
  SimpleGrid,
  Stack,
  StatCard,
  Tabs,
  Text,
} from "../../../../ui";
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

  const [reopeningSessionId, setReopeningSessionId] = useState<string | null>(
    null,
  );

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
      <PageHeader
        title="HITL Review Queue"
        description="Review and correct OCR results with low confidence scores"
      />

      {activeQueue.stats && (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          <StatCard
            label="Total Documents"
            value={activeQueue.stats.totalDocuments}
          />
          <StatCard
            label="Requires Review"
            value={activeQueue.stats.requiresReview}
            valueColor="orange"
          />
          <StatCard
            label="Avg Confidence"
            value={`${Math.round(activeQueue.stats.averageConfidence * 100)}%`}
          />
          <StatCard
            label="Reviewed Today"
            value={activeQueue.stats.reviewedToday}
            valueColor="green"
          />
        </SimpleGrid>
      )}

      <PanelCard>
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
              <Center py="xl">
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
            ) : (
              <DataTable
                striped
                highlightOnHover
                caption={`${pendingQueue.queue.length} pending`}
              >
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Document</DataTable.Th>
                    <DataTable.Th>Status</DataTable.Th>
                    <DataTable.Th>Model</DataTable.Th>
                    <DataTable.Th>Avg Confidence</DataTable.Th>
                    <DataTable.Th>Uploaded</DataTable.Th>
                    <DataTable.Th>Actions</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {pendingQueue.queue.map((doc) => {
                    const avgConfidence = getAverageConfidence(doc);
                    const inProgressSession =
                      doc.lastSession?.status === "in_progress"
                        ? doc.lastSession
                        : undefined;

                    return (
                      <DataTable.Tr key={doc.id}>
                        <DataTable.Td>
                          <Text size="sm" fw={500}>
                            {doc.original_filename}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          {inProgressSession ? (
                            <Badge variant="light" color="blue" size="sm">
                              In Review
                            </Badge>
                          ) : (
                            <Badge variant="light" size="sm">
                              {doc.status}
                            </Badge>
                          )}
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {doc.model_id || "N/A"}
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
                          {inProgressSession ? (
                            <Button
                              size="xs"
                              variant="light"
                              color="blue"
                              leftSection={<IconEye size={14} />}
                              onClick={() =>
                                navigate(`/review/${inProgressSession.id}`)
                              }
                            >
                              Resume
                            </Button>
                          ) : (
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconEye size={14} />}
                              onClick={() => handleStartSession(doc.id, false)}
                              loading={pendingQueue.isStartingSession}
                            >
                              Review
                            </Button>
                          )}
                        </DataTable.Td>
                      </DataTable.Tr>
                    );
                  })}
                </DataTable.Tbody>
              </DataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="reviewed" pt="md">
            {reviewedQueue.queue.length === 0 ? (
              <Center py="xl">
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
            ) : (
              <DataTable
                striped
                highlightOnHover
                caption={`${reviewedQueue.queue.length} reviewed`}
              >
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Document</DataTable.Th>
                    <DataTable.Th>Reviewer</DataTable.Th>
                    <DataTable.Th>Reviewed Date</DataTable.Th>
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
                          {doc.original_filename}
                        </Text>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Text size="sm">
                          {doc.lastSession?.reviewer_id || "N/A"}
                        </Text>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Text size="sm" c="dimmed">
                          {doc.lastSession?.completed_at
                            ? new Date(
                                doc.lastSession.completed_at,
                              ).toLocaleDateString()
                            : "N/A"}
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
                      </DataTable.Td>
                    </DataTable.Tr>
                  ))}
                </DataTable.Tbody>
              </DataTable>
            )}
          </Tabs.Panel>
        </Tabs>
      </PanelCard>
    </Stack>
  );
};
