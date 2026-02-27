import {
  Badge,
  Code,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconFile, IconFileCheck } from "@tabler/icons-react";

interface SampleFile {
  path: string;
  mimeType?: string;
  format?: string;
}

interface SampleDetailViewerProps {
  /** The sample ID being viewed */
  sampleId: string | null;
  /** Input files for the sample */
  inputs: SampleFile[];
  /** Ground truth files for the sample */
  groundTruthFiles: SampleFile[];
  /** Fetched ground truth content (JSON), if available */
  groundTruthContent: Record<string, unknown> | null;
  /** Whether ground truth content is currently loading */
  isLoadingGroundTruth: boolean;
  /** Whether the modal is open */
  opened: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

/**
 * Displays a sample's input files and ground truth in a modal.
 */
export function SampleDetailViewer({
  sampleId,
  inputs,
  groundTruthFiles,
  groundTruthContent,
  isLoadingGroundTruth,
  opened,
  onClose,
}: SampleDetailViewerProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Sample: ${sampleId || ""}`}
      size="xl"
      withinPortal={true}
      closeOnClickOutside={true}
      closeOnEscape={true}
      data-testid="sample-detail-viewer"
    >
      <Stack gap="md">
        {/* Input Files */}
        <div>
          <Group gap="xs" mb="xs">
            <IconFile size={16} />
            <Title order={5}>Input Files</Title>
            <Badge size="sm" variant="light">
              {inputs.length}
            </Badge>
          </Group>
          {inputs.length > 0 ? (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Path</Table.Th>
                  <Table.Th>MIME Type</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {inputs.map((file, idx) => (
                  <Table.Tr key={idx}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {file.path}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="outline">
                        {file.mimeType || "unknown"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              No input files
            </Text>
          )}
        </div>

        {/* Ground Truth */}
        <div>
          <Group gap="xs" mb="xs">
            <IconFileCheck size={16} />
            <Title order={5}>Ground Truth</Title>
            <Badge size="sm" variant="light">
              {groundTruthFiles.length}
            </Badge>
          </Group>
          {groundTruthFiles.length > 0 ? (
            <Stack gap="xs">
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Path</Table.Th>
                    <Table.Th>Format</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {groundTruthFiles.map((file, idx) => (
                    <Table.Tr key={idx}>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {file.path}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="outline">
                          {file.format || "unknown"}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {/* Ground Truth Content */}
              {isLoadingGroundTruth ? (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    Loading ground truth content...
                  </Text>
                </Group>
              ) : groundTruthContent ? (
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    Content:
                  </Text>
                  <ScrollArea h={300}>
                    <Code block data-testid="ground-truth-json">
                      {JSON.stringify(groundTruthContent, null, 2)}
                    </Code>
                  </ScrollArea>
                </div>
              ) : null}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              No ground truth files
            </Text>
          )}
        </div>
      </Stack>
    </Modal>
  );
}
