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
import { useGroup } from "../../auth/GroupContext";
import { useModels } from "../../data/hooks/useModels";
import { useWorkflows } from "../../data/hooks/useWorkflows";
import { apiService } from "../../data/services/api.service";
import { MAX_FILE_SIZE, SUPPORTED_FILE_TYPES } from "../../shared/constants";
import type { Document, UploadDocumentPayload } from "../../shared/types";
import {
  Avatar,
  Badge,
  Button,
  Divider,
  Dropzone,
  type FileRejection,
  Group,
  IconActionButton,
  notifications,
  PanelCard,
  Progress,
  rem,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "../../ui";

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
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();
  const { data: models, isLoading: modelsLoading } = useModels();
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();

  useEffect(
    () => () => {
      queue.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
    },
    [queue],
  );

  const handleDrop = (acceptedFiles: File[]) => {
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
          group_id: activeGroup!.id,
          ...(selectedWorkflow && {
            workflow_config_id: selectedWorkflow,
          }),
        };

        const response = await apiService.post<{
          success?: boolean;
          document?: Document;
          code?: string;
          message?: string;
        }>("/upload", payload);

        if (
          !response.success &&
          response.data &&
          typeof response.data === "object" &&
          "code" in response.data &&
          (response.data as { code?: string }).code === "conversion_failed" &&
          (response.data as { document?: Document }).document
        ) {
          const doc = (response.data as { document: Document }).document;
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: "error",
                    progress: 0,
                    document: doc,
                    message:
                      response.message ||
                      "Document could not be converted to PDF",
                  }
                : q,
            ),
          );
          notifications.show({
            title: "Conversion failed",
            message:
              response.message ||
              "Document could not be converted to PDF. You can remove it and try another file.",
            color: "red",
          });
          queryClient.invalidateQueries({ queryKey: ["documents"] });
          continue;
        }

        if (
          !response.success ||
          !response.data ||
          !("document" in response.data) ||
          !(response.data as { document: Document }).document
        ) {
          const errorMsg = response.message || "Upload failed";
          throw new Error(errorMsg);
        }

        const uploaded = (response.data as { document: Document }).document;

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "success",
                  progress: 100,
                  document: uploaded,
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
        if (uploaded && onDocumentFocus) {
          onDocumentFocus(uploaded);
        }
      } catch (error) {
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
    if (!activeGroup) {
      notifications.show({
        title: "Select a group",
        message: "Please select a group before uploading.",
        color: "yellow",
      });
      return;
    }

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
    <div className="bcds-upload-panel">
      <PanelCard>
        <div className="bcds-upload-panel__intro">
          <Title order={3}>Upload images</Title>
          <Text c="dimmed" size="sm">
            Select a processing model, then drag and drop scans or mobile
            captures. Click Upload to start OCR processing.
          </Text>
        </div>
        <Select
          mt="md"
          label="Processing Model"
          placeholder="Select a model"
          data={models?.map((m) => ({ value: m, label: m })) || []}
          value={selectedModel}
          onChange={setSelectedModel}
          disabled={modelsLoading}
          searchable
          required
        />
        <Select
          mt="md"
          label="Workflow (Optional)"
          placeholder="Select a workflow"
          description="Choose a custom workflow configuration for processing"
          data={
            workflows?.map((w) => ({
              value: w.workflowVersionId,
              label: `${w.name} (v${w.version})`,
            })) || []
          }
          value={selectedWorkflow}
          onChange={(value) => setSelectedWorkflow(value || null)}
          disabled={workflowsLoading}
          searchable
          clearable
        />
        <Dropzone
          className="bcds-mantine-dropzone"
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
                color="var(--theme-primary-blue)"
              />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX
                style={{ width: rem(40), height: rem(40) }}
                stroke={1.5}
                color="var(--support-border-color-danger)"
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

        <Group className="bcds-upload-panel__actions" justify="space-between">
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
            <Tooltip
              label="Select a group before uploading"
              disabled={activeGroup !== null}
            >
              <Button
                onClick={uploadDocuments}
                disabled={
                  queue.length === 0 ||
                  isUploading ||
                  !selectedModel ||
                  activeGroup === null
                }
                loading={isUploading}
                data-disabled={activeGroup === null || undefined}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </PanelCard>

      {queue.length > 0 && (
        <PanelCard>
          <div className="bcds-upload-queue__header">
            <Title order={4}>Upload queue</Title>
            <Badge>{queue.length} files</Badge>
          </div>
          <Divider mb="sm" />
          <ScrollArea
            className="bcds-upload-queue__scroll"
            h={260}
            type="hover"
          >
            <Stack gap="sm" p="sm">
              {queue.map((item) => {
                const badge = formatStatusBadge(item.status);
                return (
                  <div key={item.id} className="bcds-upload-queue-row">
                    <Group align="flex-start" justify="space-between">
                      <Group align="center" wrap="nowrap">
                        <Avatar
                          radius="sm"
                          src={item.previewUrl}
                          alt={item.file.name}
                          variant="outline"
                        >
                          <IconFileDescription size={20} />
                        </Avatar>
                        <div className="bcds-upload-queue-row__meta">
                          <Group gap={4} mb={4} wrap="nowrap">
                            <Text fw={600} truncate>
                              {item.file.name}
                            </Text>
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
                      <Group gap="xs" wrap="nowrap">
                        {item.document ? (
                          <IconActionButton
                            tooltip="Open in viewer"
                            variant="subtle"
                            color="green"
                            onClick={() =>
                              onDocumentFocus?.(item.document as Document)
                            }
                            icon={<IconCircleCheck size={18} />}
                          />
                        ) : null}
                        <IconActionButton
                          tooltip="Remove from queue"
                          variant="subtle"
                          color="red"
                          onClick={() => removeFromQueue(item.id)}
                          icon={<IconTrash size={18} />}
                        />
                      </Group>
                    </Group>
                    <Progress
                      value={item.progress}
                      mt="sm"
                      color={badge.color}
                      animated={item.status === "uploading"}
                    />
                    {item.message ? (
                      <Group gap={4} mt="xs">
                        {item.status === "error" ? (
                          <IconAlertCircle
                            size={14}
                            color="var(--typography-color-danger)"
                          />
                        ) : null}
                        <Text size="xs" c="dimmed">
                          {item.message}
                        </Text>
                      </Group>
                    ) : null}
                  </div>
                );
              })}
            </Stack>
          </ScrollArea>
        </PanelCard>
      )}
    </div>
  );
};
