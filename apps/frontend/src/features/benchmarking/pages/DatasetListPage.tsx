import { Stack, Text, Title } from "@mantine/core";

export function DatasetListPage() {
  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>Datasets</Title>
        <Text c="dimmed" size="sm">
          Manage benchmark datasets and versions
        </Text>
      </Stack>
      <Text c="dimmed">Dataset list will be implemented in US-027</Text>
    </Stack>
  );
}
