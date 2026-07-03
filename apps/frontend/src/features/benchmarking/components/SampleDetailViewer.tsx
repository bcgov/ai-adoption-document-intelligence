import {
  IconAlertCircle,
  IconDownload,
  IconFile,
  IconFileCheck,
} from "@tabler/icons-react";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import {
  ActionIcon,
  Alert,
  Badge,
  Code,
  DataTable,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
} from "../../../ui";

interface SampleFile {
  path: string;
  mimeType?: string;
  format?: string;
}

interface SampleDetailViewerProps {
  /** The sample ID being viewed */
  sampleId: string | null;
  /** Dataset ID for file downloads */
  datasetId: string;
  /** Version ID for file downloads */
  versionId: string;
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
  datasetId,
  versionId,
  inputs,
  groundTruthFiles,
  groundTruthContent,
  isLoadingGroundTruth,
  opened,
  onClose,
}: SampleDetailViewerProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async (filePath: string) => {
    try {
      setDownloadError(null);
      const blob = await apiService.getBlob(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/files/download?path=${encodeURIComponent(filePath)}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to download file",
      );
    }
  };
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
        {downloadError && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Download failed"
            color="red"
            variant="light"
            withCloseButton
            onClose={() => setDownloadError(null)}
            data-testid="download-error-alert"
          >
            {downloadError}
          </Alert>
        )}

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
            <DataTable striped highlightOnHover withTableBorder>
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Path</DataTable.Th>
                  <DataTable.Th>MIME Type</DataTable.Th>
                  <DataTable.Th w={50}>Download</DataTable.Th>
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {inputs.map((file, idx) => (
                  <DataTable.Tr key={idx}>
                    <DataTable.Td>
                      <Text size="sm" ff="monospace">
                        {file.path}
                      </Text>
                    </DataTable.Td>
                    <DataTable.Td>
                      <Badge size="sm" variant="outline">
                        {file.mimeType || "unknown"}
                      </Badge>
                    </DataTable.Td>
                    <DataTable.Td>
                      <Tooltip label="Download file">
                        <ActionIcon
                          variant="subtle"
                          onClick={() => handleDownload(file.path)}
                          data-testid={`download-input-btn-${idx}`}
                        >
                          <IconDownload size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </DataTable.Td>
                  </DataTable.Tr>
                ))}
              </DataTable.Tbody>
            </DataTable>
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
              <DataTable striped highlightOnHover withTableBorder>
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Path</DataTable.Th>
                    <DataTable.Th>Format</DataTable.Th>
                    <DataTable.Th w={50}>Download</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {groundTruthFiles.map((file, idx) => (
                    <DataTable.Tr key={idx}>
                      <DataTable.Td>
                        <Text size="sm" ff="monospace">
                          {file.path}
                        </Text>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Badge size="sm" variant="outline">
                          {file.format || "unknown"}
                        </Badge>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Tooltip label="Download file">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => handleDownload(file.path)}
                            data-testid={`download-gt-btn-${idx}`}
                          >
                            <IconDownload size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </DataTable.Td>
                    </DataTable.Tr>
                  ))}
                </DataTable.Tbody>
              </DataTable>

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
