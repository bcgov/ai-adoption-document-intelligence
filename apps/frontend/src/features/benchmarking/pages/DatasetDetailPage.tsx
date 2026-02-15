import { Stack, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>Dataset Detail</Title>
        <Text c="dimmed" size="sm">
          Dataset ID: {id}
        </Text>
      </Stack>
      <Text c="dimmed">
        Dataset detail with version list and sample preview will be implemented
        in US-028
      </Text>
    </Stack>
  );
}
