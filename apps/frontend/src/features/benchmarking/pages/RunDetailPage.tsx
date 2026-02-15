import { Stack, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";

export function RunDetailPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>Run Detail</Title>
        <Text c="dimmed" size="sm">
          Project ID: {id} | Run ID: {runId}
        </Text>
      </Stack>
      <Text c="dimmed">
        Run detail with metrics, artifacts, and MLflow links will be implemented
        in US-031
      </Text>
    </Stack>
  );
}
