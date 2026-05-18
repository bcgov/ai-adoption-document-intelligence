import { DocumentUploadPanel } from "../components/upload/DocumentUploadPanel";
import { Badge, Group, Stack, Text, Title } from "../ui";

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
