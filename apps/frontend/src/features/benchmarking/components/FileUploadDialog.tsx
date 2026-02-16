import {
  Button,
  Group,
  Modal,
  Progress,
  rem,
  Stack,
  Text,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { IconFile, IconUpload, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useDatasetUpload } from "../hooks/useDatasetUpload";

interface FileUploadDialogProps {
  datasetId: string;
  opened: boolean;
  onClose: () => void;
}

export function FileUploadDialog({
  datasetId,
  opened,
  onClose,
}: FileUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { upload, isUploading, isSuccess, reset } = useDatasetUpload(datasetId);

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
      title="Upload Files"
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
