import { Stack, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>Project Detail</Title>
        <Text c="dimmed" size="sm">
          Project ID: {id}
        </Text>
      </Stack>
      <Text c="dimmed">
        Project detail with definition list and run list will be implemented in
        US-029 and US-030
      </Text>
    </Stack>
  );
}
