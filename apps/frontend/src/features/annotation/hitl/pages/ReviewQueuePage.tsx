import { Typography } from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconEye,
  IconFlag,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
} from "@tabler/icons-react";
import { FC, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Box,
  Button,
  Center,
  DataTable,
  Group,
  IconActionButton,
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
import { useReviewQueue } from "../hooks/useReviewQueue";

export const ReviewQueuePage: FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>("pending");
  const [pageNumber, setPageNumber] = useState<number>(0);
  const PAGE_SIZE = 5;
  const offset = useMemo(() => PAGE_SIZE * pageNumber, [pageNumber]);

  const pendingQueue = useReviewQueue({
    limit: PAGE_SIZE,
    reviewStatus: "pending",
    offset,
  });

  const claimedQueue = useReviewQueue({
    limit: PAGE_SIZE,
    reviewStatus: "claimed",
    offset,
  });

  const reviewedQueue = useReviewQueue({
    limit: PAGE_SIZE,
    reviewStatus: "reviewed",
    offset,
  });

  const flaggedQueue = useReviewQueue({
    limit: PAGE_SIZE,
    reviewStatus: "flagged",
    offset,
  });

  const queuesByTab: Record<string, ReturnType<typeof useReviewQueue>> = {
    pending: pendingQueue,
    claimed: claimedQueue,
    flagged: flaggedQueue,
    reviewed: reviewedQueue,
  };
  const activeQueue = queuesByTab[activeTab ?? "pending"] ?? pendingQueue;

  // Queue-wide figures: the same for every tab, so read them from one queue.
  const stats = pendingQueue.stats;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "green";
    if (confidence >= 0.7) return "yellow";
    return "red";
  };

  // A tab loads one page of documents. Say so when the queue holds more than
  // the page shows, so the caption never contradicts the count on the tab.
  const queueCaption = (shown: number, total: number, noun: string) =>
    shown < total ? `Showing ${shown} of ${total} ${noun}` : `${total} ${noun}`;

  if (activeQueue.isLoading) {
    return (
      <Center h="70vh">
        <Loader size="lg" />
      </Center>
    );
  }

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
      // Most often the document was locked by another reviewer between this
      // queue being loaded and the click.
      notifications.show({
        title: "Could not open document",
        message:
          "Another reviewer may have started on it. Refresh the queue and try again.",
        color: "red",
        autoClose: 5000,
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "green";
      case "flagged":
        return "orange";
      case "abandoned":
        return "gray";
      default:
        return "blue";
    }
  };

  const avgConfidence = stats ? Math.round(stats.averageConfidence * 100) : NaN;

  return (
    <Stack gap="lg">
      <PageHeader
        title="HITL review queue"
        description="Review and correct OCR results with low confidence scores"
      />

      {stats && (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          <StatCard label="Total documents" value={stats.totalDocuments} />
          <StatCard
            label="Requires review"
            value={stats.requiresReview}
            valueColor="orange"
          />
          <StatCard
            label="Avg confidence"
            value={`${Number.isNaN(avgConfidence) ? "-" : avgConfidence}%`}
          />
          <StatCard
            label="Reviewed today"
            value={stats.reviewedToday}
            valueColor="green"
          />
        </SimpleGrid>
      )}

      <PanelCard>
        <Tabs
          value={activeTab}
          onChange={(value) => {
            setActiveTab(value);
            setPageNumber(0);
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="pending" leftSection={<IconClock size={16} />}>
              Pending review ({pendingQueue.total})
            </Tabs.Tab>
            <Tabs.Tab value="claimed" leftSection={<IconEye size={16} />}>
              Claimed by you ({claimedQueue.total})
            </Tabs.Tab>
            <Tabs.Tab value="flagged" leftSection={<IconFlag size={16} />}>
              Flagged ({flaggedQueue.total})
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
                caption={queueCaption(
                  pendingQueue.queue.length,
                  pendingQueue.total,
                  "pending",
                )}
              >
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Document</DataTable.Th>
                    <DataTable.Th>Model</DataTable.Th>
                    <DataTable.Th>Workflow</DataTable.Th>
                    <DataTable.Th>Avg confidence</DataTable.Th>
                    <DataTable.Th>Uploaded</DataTable.Th>
                    <DataTable.Th>Actions</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {pendingQueue.queue.map((doc) => {
                    const avgConfidence = doc.average_confidence;
                    return (
                      <DataTable.Tr key={doc.id}>
                        <DataTable.Td>
                          <Text size="sm" fw={500}>
                            {doc.original_filename}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {doc.model_id || "N/A"}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {doc.workflow_id || "N/A"}
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
                            loading={pendingQueue.isStartingSession}
                          >
                            Start review
                          </Button>
                        </DataTable.Td>
                      </DataTable.Tr>
                    );
                  })}
                </DataTable.Tbody>
              </DataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="claimed" pt="md">
            {claimedQueue.queue.length === 0 ? (
              <Center py="xl">
                <Stack align="center" gap="md">
                  <IconAlertCircle size={48} stroke={1.5} color="gray" />
                  <Stack gap={4} align="center">
                    <Text fw={600}>No documents claimed by you</Text>
                    <Text size="sm" c="dimmed">
                      Documents you start reviewing appear here until you finish
                      or release them
                    </Text>
                  </Stack>
                </Stack>
              </Center>
            ) : (
              <DataTable
                striped
                highlightOnHover
                caption={queueCaption(
                  claimedQueue.queue.length,
                  claimedQueue.total,
                  "claimed",
                )}
              >
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Document</DataTable.Th>
                    <DataTable.Th>Model</DataTable.Th>
                    <DataTable.Th>Workflow</DataTable.Th>
                    <DataTable.Th>Avg confidence</DataTable.Th>
                    <DataTable.Th>Uploaded</DataTable.Th>
                    <DataTable.Th>Actions</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {claimedQueue.queue.map((doc) => {
                    const avgConfidence = doc.average_confidence;
                    return (
                      <DataTable.Tr key={doc.id}>
                        <DataTable.Td>
                          <Text size="sm" fw={500}>
                            {doc.original_filename}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {doc.model_id || "N/A"}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {doc.workflow_id || "N/A"}
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
                            color="blue"
                            leftSection={<IconEye size={14} />}
                            disabled={!doc.lock?.session_id}
                            onClick={() =>
                              navigate(`/review/${doc.lock!.session_id}`)
                            }
                          >
                            Resume
                          </Button>
                        </DataTable.Td>
                      </DataTable.Tr>
                    );
                  })}
                </DataTable.Tbody>
              </DataTable>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="flagged" pt="md">
            {flaggedQueue.queue.length === 0 ? (
              <Center py="xl">
                <Stack align="center" gap="md">
                  <IconAlertCircle size={48} stroke={1.5} color="gray" />
                  <Stack gap={4} align="center">
                    <Text fw={600}>No flagged documents</Text>
                    <Text size="sm" c="dimmed">
                      Flagged documents appear here for priority review
                    </Text>
                  </Stack>
                </Stack>
              </Center>
            ) : (
              <DataTable>
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Filename</DataTable.Th>
                    <DataTable.Th>Last reviewer</DataTable.Th>
                    <DataTable.Th>Avg confidence</DataTable.Th>
                    <DataTable.Th>Flag note</DataTable.Th>
                    <DataTable.Th>Actions</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {flaggedQueue.queue.map((doc) => {
                    const avgConfidence = doc.average_confidence;
                    return (
                      <DataTable.Tr key={doc.id}>
                        <DataTable.Td>
                          <Text size="sm" fw={500}>
                            {doc.original_filename}
                          </Text>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Text size="sm" c="dimmed">
                            {doc.lastSession?.reviewer_id || "N/A"}
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
                          {doc.lastSession?.flag_note ? (
                            <Text size="sm" style={{ maxWidth: 280 }}>
                              {doc.lastSession.flag_note}
                            </Text>
                          ) : (
                            <Text size="sm" c="dimmed">
                              —
                            </Text>
                          )}
                        </DataTable.Td>
                        <DataTable.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="subtle"
                              color="gray"
                              leftSection={<IconEye size={14} />}
                              onClick={() =>
                                navigate(
                                  `/review/${doc.lastSession!.id}?readOnly=true`,
                                )
                              }
                              disabled={!doc.lastSession?.id}
                            >
                              View
                            </Button>
                          </Group>
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
                caption={queueCaption(
                  reviewedQueue.queue.length,
                  reviewedQueue.total,
                  "reviewed",
                )}
              >
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Document</DataTable.Th>
                    <DataTable.Th>Reviewer</DataTable.Th>
                    <DataTable.Th>Reviewed date</DataTable.Th>
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
            )}
          </Tabs.Panel>
        </Tabs>
        <Box
          style={{
            marginTop: "1em",
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "end",
          }}
        >
          <IconActionButton
            icon={
              <IconPlayerSkipForwardFilled
                style={{ transform: "rotate(180deg)" }}
              />
            }
            tooltip={"First"}
            disabled={pageNumber <= 0}
            onClick={() => {
              setPageNumber(0);
            }}
          />
          <IconActionButton
            icon={
              <IconPlayerPlayFilled style={{ transform: "rotate(180deg)" }} />
            }
            tooltip={"Previous"}
            disabled={pageNumber <= 0}
            onClick={() => {
              setPageNumber(pageNumber - 1);
            }}
          />
          <Typography>
            Page {pageNumber + 1} of {Math.ceil(activeQueue.total / PAGE_SIZE)}
          </Typography>
          <IconActionButton
            icon={<IconPlayerPlayFilled />}
            tooltip={"Next"}
            disabled={offset + PAGE_SIZE > activeQueue.total}
            onClick={() => {
              setPageNumber(pageNumber + 1);
            }}
          />
          <IconActionButton
            icon={<IconPlayerSkipForwardFilled />}
            tooltip={"Last"}
            disabled={offset + PAGE_SIZE > activeQueue.total}
            onClick={() => {
              setPageNumber(Math.floor(activeQueue.total / PAGE_SIZE));
            }}
          />
        </Box>
      </PanelCard>
    </Stack>
  );
};
