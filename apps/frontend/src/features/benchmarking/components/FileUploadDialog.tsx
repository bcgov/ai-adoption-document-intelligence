import {
  Accordion,
  Badge,
  Button,
  Code,
  Group,
  List,
  Modal,
  Progress,
  rem,
  Stack,
  Text,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { IconFile, IconInfoCircle, IconUpload, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useDatasetUpload } from "../hooks/useDatasetUpload";

interface FileUploadDialogProps {
  datasetId: string;
  versionId: string;
  /** Optional version label (e.g. "v3") to display in the dialog title */
  versionLabel?: string;
  opened: boolean;
  onClose: () => void;
}

/**
 * Dialog for uploading files to a specific dataset version.
 * @param props - FileUploadDialogProps
 */
export function FileUploadDialog({
  datasetId,
  versionId,
  versionLabel,
  opened,
  onClose,
}: FileUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { upload, isUploading, isSuccess, error, reset } = useDatasetUpload(datasetId, versionId);

  const handleDrop = (files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      upload(selectedFiles);
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={versionLabel ? `Upload Files to ${versionLabel}` : "Upload Files"}
      size="lg"
      data-testid="upload-files-dialog"
    >
      <Stack gap="md">
        {!isSuccess && (
          <>
            <Dropzone
              onDrop={handleDrop}
              maxSize={100 * 1024 * 1024}
              disabled={isUploading}
              data-testid="file-dropzone"
            >
              <Group
                justify="center"
                gap="xl"
                mih={220}
                style={{ pointerEvents: "none" }}
              >
                <Dropzone.Accept>
                  <IconUpload
                    style={{
                      width: rem(52),
                      height: rem(52),
                      color: "var(--mantine-color-blue-6)",
                    }}
                    stroke={1.5}
                  />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconX
                    style={{
                      width: rem(52),
                      height: rem(52),
                      color: "var(--mantine-color-red-6)",
                    }}
                    stroke={1.5}
                  />
                </Dropzone.Reject>
                <Dropzone.Idle>
                  <IconFile
                    style={{
                      width: rem(52),
                      height: rem(52),
                      color: "var(--mantine-color-dimmed)",
                    }}
                    stroke={1.5}
                  />
                </Dropzone.Idle>

                <div>
                  <Text size="xl" inline>
                    Drag files here or click to select
                  </Text>
                  <Text size="sm" c="dimmed" inline mt={7}>
                    Upload documents and ground truth files (max 100MB per file)
                  </Text>
                </div>
              </Group>
            </Dropzone>

            <Accordion variant="contained" data-testid="upload-help-section">
              <Accordion.Item value="help">
                <Accordion.Control icon={<IconInfoCircle size={16} />}>
                  <Text size="sm" fw={500}>How files are categorized &amp; paired</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <div>
                      <Text size="sm" fw={500} mb={4}>File categorization</Text>
                      <Text size="sm" c="dimmed">
                        Files are automatically categorized by type:
                      </Text>
                      <List size="sm" mt={4}>
                        <List.Item>
                          <Badge size="xs" variant="light" color="blue" mr={4}>Ground Truth</Badge>
                          JSON, JSONL, CSV, XLSX, Parquet files
                        </List.Item>
                        <List.Item>
                          <Badge size="xs" variant="light" color="gray" mr={4}>Input</Badge>
                          Everything else (images, PDFs, etc.)
                        </List.Item>
                      </List>
                    </div>
                    <div>
                      <Text size="sm" fw={500} mb={4}>Pairing ground truth with inputs</Text>
                      <Text size="sm" c="dimmed">
                        Ground truth files are paired with inputs by matching the <strong>base filename</strong> —
                        a <Code>.json</Code> file with the same name as the input document is treated as its ground truth.
                      </Text>
                      <List size="sm" mt={4}>
                        <List.Item>
                          <Code>invoice-001.pdf</Code> + <Code>invoice-001.json</Code> → paired as one sample
                        </List.Item>
                        <List.Item>
                          <Code>receipt.png</Code> + <Code>receipt.json</Code> → paired as one sample
                        </List.Item>
                      </List>
                    </div>
                    <div>
                      <Text size="sm" fw={500} mb={4}>Example</Text>
                      <Text size="sm" c="dimmed">
                        Uploading <Code>receipt.png</Code> and <Code>receipt.json</Code> creates
                        one sample with both an input document and ground truth.
                        Duplicate filenames within a single upload are not allowed.
                      </Text>
                    </div>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            {selectedFiles.length > 0 && (
              <Stack gap="xs" data-testid="selected-files-list">
                <Text size="sm" fw={500}>
                  Selected Files ({selectedFiles.length})
                </Text>
                {selectedFiles.map((file, index) => (
                  <Group key={index} justify="space-between" data-testid={`file-item-${index}`}>
                    <Text size="sm" truncate>
                      {file.name} ({(file.size / 1024).toFixed(2)} KB)
                    </Text>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleRemoveFile(index)}
                      disabled={isUploading}
                      data-testid={`remove-file-btn-${index}`}
                    >
                      Remove
                    </Button>
                  </Group>
                ))}
              </Stack>
            )}

            {isUploading && <Progress value={100} animated data-testid="upload-progress" />}
          </>
        )}

        {isSuccess && (
          <Text c="green" size="sm" data-testid="upload-success-message">
            Files uploaded successfully!
          </Text>
        )}

        {error && (
          <Text c="red" size="sm" data-testid="upload-error-message">
            Upload failed: {error instanceof Error ? error.message : "An unexpected error occurred"}
          </Text>
        )}

        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={isUploading}
            data-testid="upload-cancel-btn"
          >
            {isSuccess ? "Close" : "Cancel"}
          </Button>
          {!isSuccess && (
            <Button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || isUploading}
              loading={isUploading}
              data-testid="upload-submit-btn"
            >
              Upload
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
