import { Code, Modal, ScrollArea } from "@mantine/core";

interface GroundTruthViewerProps {
  groundTruth: Record<string, unknown> | null;
  opened: boolean;
  onClose: () => void;
}

export function GroundTruthViewer({
  groundTruth,
  opened,
  onClose,
}: GroundTruthViewerProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Ground Truth JSON"
      size="xl"
    >
      <ScrollArea h={500}>
        <Code block>{JSON.stringify(groundTruth, null, 2)}</Code>
      </ScrollArea>
    </Modal>
  );
}
