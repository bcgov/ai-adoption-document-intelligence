import { Stack, Text, Title } from "@mantine/core";

export function ProjectListPage() {
  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>Benchmark Projects</Title>
        <Text c="dimmed" size="sm">
          Organize benchmarks by project
        </Text>
      </Stack>
      <Text c="dimmed">
        Project list will be implemented in a future user story
      </Text>
    </Stack>
  );
}
