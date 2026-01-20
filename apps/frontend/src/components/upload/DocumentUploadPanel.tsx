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
import { useModels } from "../../data/hooks/useModels";
import { apiService } from "../../data/services/api.service";
import { MAX_FILE_SIZE, SUPPORTED_FILE_TYPES } from "../../shared/constants";
import type { Document, UploadDocumentPayload } from "../../shared/types";

interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "queued" | "uploading" | "success" | "error";
  message?: string;
  document?: Document;
  progress: number;
}

interface DocumentUploadPanelProps {
  onDocumentFocus?: (document: Document) => void;
}

const dropzoneAccept: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/tiff": [".tif", ".tiff"],
};

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

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const DocumentUploadPanel: React.FC<DocumentUploadPanelProps> = ({
  onDocumentFocus,
}) => {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: models, isLoading: modelsLoading } = useModels();

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
    const newItems = acceptedFiles.map<UploadQueueItem>((file) => ({
      id: generateId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      progress: 0,
    }));

    // Add to queue - upload will be triggered manually
    setQueue((prev) => [...newItems, ...prev]);
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

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const uploadDocumentsFromFiles = async (itemsToUpload: UploadQueueItem[]) => {
    console.info(`[Upload] Processing ${itemsToUpload.length} files`);
    setIsUploading(true);

    for (const item of itemsToUpload) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: "uploading", progress: 10, message: undefined }
            : q,
        ),
      );

      try {
        const base64 = await fileToBase64(item.file);
        const payload: UploadDocumentPayload = {
          title: item.file.name.replace(/\.[^/.]+$/, "") || "Untitled document",
          file: base64,
          file_type: item.file.type.includes("pdf") ? "pdf" : "image",
          original_filename: item.file.name,
          metadata: {
            size: item.file.size,
            lastModified: item.file.lastModified,
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

        console.info("[Upload] Making API request to /api/upload");
        const response = await apiService.post<{ document: Document }>(
          "/upload",
          payload,
        );

        console.info("[Upload] Received API response", {
          success: response.success,
          hasData: !!response.data,
          message: response.message,
        });

        if (!response.success || !response.data) {
          const errorMsg = response.message || "Upload failed";
          console.error("[Upload] Upload failed:", errorMsg);
          throw new Error(errorMsg);
        }

        console.debug(
          "[Upload] Successful response from /api/upload",
          response.data.document,
        );

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "success",
                  progress: 100,
                  document: response.data.document,
                }
              : q,
          ),
        );

        notifications.show({
          title: "Upload complete",
          message: `${item.file.name} was uploaded successfully.`,
          color: "green",
        });

        queryClient.invalidateQueries({ queryKey: ["documents"] });
        if (response.data.document && onDocumentFocus) {
          onDocumentFocus(response.data.document);
        }
      } catch (error) {
        console.error("Upload failed", error);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "error",
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                  progress: 0,
                }
              : q,
          ),
        );
        notifications.show({
          title: `Failed to upload ${item.file.name}`,
          message: error instanceof Error ? error.message : "Unknown error",
          color: "red",
        });
      }
    }
    setIsUploading(false);
  };

  const uploadDocuments = async () => {
    console.info("[Upload] Starting upload process", {
      selectedModel,
      queueLength: queue.length,
      queuedItems: queue.filter((item) => item.status === "queued").length,
    });
    
    if (!selectedModel) {
      console.warn("[Upload] No model selected");
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
      console.warn("[Upload] No pending files to upload");
      notifications.show({
        title: "Nothing to upload",
        message: "Add images first, then click upload.",
        color: "yellow",
      });
      return;
    }

    console.info(`[Upload] Found ${pending.length} pending files, starting upload`);
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
              onClick={() => setQueue([])}
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
                        {item.document && (
                          <Tooltip label="Open in viewer">
                            <ActionIcon
                              variant="subtle"
                              color="green"
                              onClick={() =>
                                onDocumentFocus?.(item.document as Document)
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
