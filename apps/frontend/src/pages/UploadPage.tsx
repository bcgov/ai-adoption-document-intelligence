import { Badge, Group, Stack, Text, Title } from "@mantine/core";
import { DocumentUploadPanel } from "../components/upload/DocumentUploadPanel";

export function UploadPage() {
  return (
    <>
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Upload documents</Title>
          <Text c="dimmed" size="sm">
            Add new images and track their ingestion progress.
          </Text>
        </Stack>
        <Badge variant="outline" size="lg">
          {new Date().toLocaleDateString()}
        </Badge>
      </Group>

      <DocumentUploadPanel />
    </>
  );
}
