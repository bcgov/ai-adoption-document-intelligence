import { Badge, Group, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { DocumentViewerModal } from "../components/document/DocumentViewerModal";
import { ProcessingQueue } from "../components/queue/ProcessingQueue";
import type { Document } from "../shared/types";

export function QueuePage() {
  const [viewerOpened, setViewerOpened] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(
    null,
  );

  const openViewer = (doc: Document) => {
    setSelectedDocument(doc);
    setViewerOpened(true);
  };

  return (
    <>
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Processing monitor</Title>
          <Text c="dimmed" size="sm">
            View the OCR pipeline and drill into results.
          </Text>
        </Stack>
        <Badge variant="outline" size="lg">
          {new Date().toLocaleDateString()}
        </Badge>
      </Group>

      <ProcessingQueue onSelectDocument={openViewer} />

      <DocumentViewerModal
        document={selectedDocument}
        opened={viewerOpened}
        onClose={() => setViewerOpened(false)}
      />
    </>
  );
}
