import { FC } from "react";
import {
  Stack,
  Title,
  Text,
  Card,
  Badge,
  Table,
  Button,
  Loader,
  Center,
  Grid,
  Paper,
} from "@mantine/core";
import { IconEye, IconAlertCircle } from "@tabler/icons-react";
import { useReviewQueue } from "../hooks/useReviewQueue";
import { HITL_MAX_CONFIDENCE } from "@/shared/constants";

interface ReviewQueuePageProps {
  onStartSession?: (sessionId: string) => void;
}

export const ReviewQueuePage: FC<ReviewQueuePageProps> = ({
  onStartSession,
}) => {
  const {
    queue,
    stats,
    isLoading,
    startSessionAsync,
    isStartingSession,
  } = useReviewQueue({
      maxConfidence: HITL_MAX_CONFIDENCE,
      limit: 50,
    });

  if (isLoading) {
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

  const getAverageConfidence = (doc: any) => {
    if (!doc.ocr_result?.fields) return 0;
    const fields = Object.values(doc.ocr_result.fields) as any[];
    if (fields.length === 0) return 0;
    const sum = fields.reduce((acc, field) => acc + (field.confidence || 0), 0);
    return sum / fields.length;
  };

  const handleStartSession = async (documentId: string) => {
    try {
      const session = await startSessionAsync(documentId);
      if (session?.id) {
        onStartSession?.(session.id);
      }
    } catch (error) {
      console.error("Failed to start review session", error);
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

      {stats && (
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper withBorder p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Total Documents
                </Text>
                <Text size="xl" fw={700}>
                  {stats.totalDocuments}
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
                  {stats.requiresReview}
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
                  {Math.round(stats.averageConfidence * 100)}%
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
                  {stats.reviewedToday}
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      )}

      {queue.length === 0 ? (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="md">
              <IconAlertCircle size={48} stroke={1.5} color="gray" />
              <Stack gap={4} align="center">
                <Text fw={600}>No documents in review queue</Text>
                <Text size="sm" c="dimmed">
                  All documents have been reviewed or have high confidence scores
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
              {queue.map((doc: any) => {
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
                        onClick={() => handleStartSession(doc.id)}
                        loading={isStartingSession}
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
    </Stack>
  );
};
