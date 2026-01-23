import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Progress,
  rem,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { Dropzone, FileRejection } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCircleCheck,
  IconFileDescription,
  IconPhoto,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useUploadQueue, type UploadQueueItem } from "../../data/hooks/useUploadQueue";
import { useModels } from "../../data/hooks/useModels";
import { apiService } from "../../data/services/api.service";
import { MAX_FILE_SIZE, SUPPORTED_FILE_TYPES } from "../../shared/constants";
import { dropzoneAccept, fileToBase64 } from "../../shared/utils";
import type { Document, UploadDocumentPayload } from "../../shared/types";

interface DocumentUploadPanelProps {
  onDocumentFocus?: (document: Document) => void;
}

const formatStatusBadge = (status: UploadQueueItem["status"]) => {
  switch (status) {
    case "queued":
      return { label: "Queued", color: "gray" as const };
    case "uploading":
      return { label: "Uploading", color: "blue" as const };
    case "success":
      return { label: "Uploaded", color: "green" as const };
    case "error":
      return { label: "Failed", color: "red" as const };
    default:
      return { label: status, color: "gray" as const };
  }
};

export const DocumentUploadPanel: React.FC<DocumentUploadPanelProps> = ({
  onDocumentFocus,
}) => {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: models, isLoading: modelsLoading } = useModels();
  const { queue, isUploading, addFiles, removeFromQueue, clearQueue, uploadFiles } =
    useUploadQueue<Document>({
      onUploadSuccess: (item, document) => {
        notifications.show({
          title: "Upload complete",
          message: `${item.file.name} was uploaded successfully.`,
          color: "green",
        });
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        if (document && onDocumentFocus) {
          onDocumentFocus(document);
        }
      },
      onUploadError: (item, error) => {
        notifications.show({
          title: `Failed to upload ${item.file.name}`,
          message: error.message,
          color: "red",
        });
      },
    });

  useEffect(
    () => () => {
      queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [queue],
  );

  const handleDrop = (acceptedFiles: File[]) => {
    console.info(
      "[Upload] Accepted files:",
      acceptedFiles.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      })),
    );
    // Add to queue - upload will be triggered manually
    addFiles(acceptedFiles);
  };

  const handleReject = (rejections: FileRejection[]) => {
    rejections.forEach((rej) => {
      notifications.show({
        title: `Unable to add ${rej.file.name}`,
        message: rej.errors.map((err) => err.message).join(", "),
        color: "red",
      });
    });
  };

  const uploadDocumentsFromFiles = async (itemsToUpload: UploadQueueItem[]) => {
    console.info(`[Upload] Processing ${itemsToUpload.length} files`);
    await uploadFiles(async (file) => {
      const base64 = await fileToBase64(file);
      const payload: UploadDocumentPayload = {
        title: file.name.replace(/\.[^/.]+$/, "") || "Untitled document",
        file: base64,
        file_type: file.type.includes("pdf") ? "pdf" : "image",
        original_filename: file.name,
        metadata: {
          size: file.size,
          lastModified: file.lastModified,
        },
        model_id: selectedModel!,
      };

      console.debug("[Upload] Sending payload to /api/upload", {
        title: payload.title,
        file_type: payload.file_type,
        original_filename: payload.original_filename,
        model_id: payload.model_id,
        fileLength: payload.file.length,
      });

      const response = await apiService.post<{ document: Document }>(
        "/upload",
        payload,
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || "Upload failed");
      }

      console.debug(
        "[Upload] Successful response from /api/upload",
        response.data.document,
      );

      return response.data.document;
    }, itemsToUpload);
  };

  const uploadDocuments = async () => {
    console.info("[Upload] Starting upload process");
    if (!selectedModel) {
      notifications.show({
        title: "Select a model",
        message: "Please select a processing model before uploading.",
        color: "yellow",
      });
      return;
    }

    const pending = queue.filter(
      (item) => item.status === "queued" || item.status === "error",
    );
    if (pending.length === 0) {
      console.info("[Upload] No pending files to upload");
      notifications.show({
        title: "Nothing to upload",
        message: "Add images first, then click upload.",
        color: "yellow",
      });
      return;
    }

    await uploadDocumentsFromFiles(pending);
  };

  return (
    <Stack gap="lg">
      <Paper shadow="sm" radius="md" p="lg" withBorder>
        <Stack gap="sm">
          <Title order={3}>Upload images</Title>
          <Text c="dimmed" size="sm">
            Select a processing model, then drag and drop scans or mobile
            captures. Click Upload to start OCR processing.
          </Text>
        </Stack>
        <Select
          mt="md"
          label="Processing Model"
          placeholder="Select a model"
          data={models?.map((m) => ({ value: m, label: m })) || []}
          value={selectedModel}
          onChange={setSelectedModel}
          disabled={modelsLoading}
          searchable
        />
        <Dropzone
          mt="lg"
          onDrop={handleDrop}
          onReject={handleReject}
          accept={dropzoneAccept}
          maxSize={MAX_FILE_SIZE}
          multiple
        >
          <Group
            justify="center"
            gap="xl"
            mih={140}
            style={{ pointerEvents: "none" }}
          >
            <Dropzone.Accept>
              <IconUpload
                style={{ width: rem(40), height: rem(40) }}
                stroke={1.5}
                color="var(--mantine-color-blue-6)"
              />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX
                style={{ width: rem(40), height: rem(40) }}
                stroke={1.5}
                color="var(--mantine-color-red-6)"
              />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconPhoto
                style={{ width: rem(40), height: rem(40) }}
                stroke={1.5}
              />
            </Dropzone.Idle>

            <div>
              <Text size="xl" inline>
                Drag images or click to browse
              </Text>
              <Text size="sm" c="dimmed" inline mt={7}>
                Accepts {SUPPORTED_FILE_TYPES.join(", ")} up to{" "}
                {Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB
              </Text>
            </div>
          </Group>
        </Dropzone>

        <Group mt="md" justify="space-between">
          <Text size="sm" c="dimmed">
            {queue.length === 0
              ? "No files queued yet"
              : `${queue.length} file(s) ready`}
          </Text>
          <Group>
            <Button
              variant="subtle"
              color="gray"
              disabled={queue.length === 0 || isUploading}
              onClick={clearQueue}
            >
              Clear all
            </Button>
            <Button
              onClick={uploadDocuments}
              disabled={queue.length === 0 || isUploading || !selectedModel}
              loading={isUploading}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </Group>
        </Group>
      </Paper>

      {queue.length > 0 && (
        <Paper shadow="sm" radius="md" p="lg" withBorder>
          <Group justify="space-between" mb="sm">
            <Title order={4}>Upload queue</Title>
            <Badge>{queue.length} files</Badge>
          </Group>
          <Divider mb="sm" />
          <ScrollArea h={260} type="hover">
            <Stack gap="sm">
              {queue.map((item) => {
                const badge = formatStatusBadge(item.status);
                return (
                  <Paper key={item.id} radius="md" p="sm" withBorder>
                    <Group align="flex-start" justify="space-between">
                      <Group align="center">
                        <Avatar
                          radius="sm"
                          src={item.previewUrl}
                          alt={item.file.name}
                          variant="outline"
                        >
                          <IconFileDescription size={20} />
                        </Avatar>
                        <div>
                          <Group gap={4} mb={4}>
                            <Text fw={600}>{item.file.name}</Text>
                            <Badge
                              size="sm"
                              color={badge.color}
                              variant="light"
                            >
                              {badge.label}
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {Math.round(item.file.size / 1024)} KB •{" "}
                            {item.file.type}
                          </Text>
                        </div>
                      </Group>
                      <Group gap="xs">
                        {item.result && (
                          <Tooltip label="Open in viewer">
                            <ActionIcon
                              variant="subtle"
                              color="green"
                              onClick={() =>
                                onDocumentFocus?.(item.result as Document)
                              }
                            >
                              <IconCircleCheck size={18} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => removeFromQueue(item.id)}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Progress
                      value={item.progress}
                      mt="sm"
                      color={badge.color}
                      animated={item.status === "uploading"}
                    />
                    {item.message && (
                      <Group gap={4} mt="xs">
                        {item.status === "error" ? (
                          <IconAlertCircle
                            size={14}
                            color="var(--mantine-color-red-6)"
                          />
                        ) : null}
                        <Text size="xs" c="dimmed">
                          {item.message}
                        </Text>
                      </Group>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
        </Paper>
      )}
    </Stack>
  );
};
