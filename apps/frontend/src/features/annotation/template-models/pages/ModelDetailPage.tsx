import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Center,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  rem,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { Dropzone, FileRejection } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconFileDescription,
  IconFileImport,
  IconPhoto,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { FC, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  type UploadQueueItem,
  useUploadQueue,
} from "@/data/hooks/useUploadQueue";
import { apiService } from "@/data/services/api.service";
import { type FieldDefinition, FieldType } from "../../core/types/field";
import { ExportPanel } from "../components/ExportPanel";
import { FieldSchemaEditor } from "../components/FieldSchemaEditor";
import { TrainingPanel } from "../components/TrainingPanel";
import { useFieldSchema } from "../hooks/useFieldSchema";
import {
  useTemplateModel,
  useTemplateModelDocuments,
} from "../hooks/useTemplateModels";
import type { TemplateModelStatus } from "../types/training.types";

interface LabelingUploadPayload {
  title: string;
  file: string;
  file_type: "pdf" | "image" | "scan";
  original_filename?: string;
  metadata?: Record<string, unknown>;
  group_id: string;
}

import { MAX_FILE_SIZE, SUPPORTED_FILE_TYPES } from "@/shared/constants";
import { dropzoneAccept, fileToBase64 } from "@/shared/utils";

interface FieldFormData {
  field_key?: string;
  field_type?: string;
  field_format?: string;
  format_spec?: string;
  display_order?: number;
}

interface FormatSuggestion {
  fieldKey: string;
  formatSpec: {
    canonicalize: string;
    pattern?: string;
    displayTemplate?: string;
  };
  rationale: string;
  sampleCount: number;
}

type SuggestionState = "pending" | "accepted" | "rejected";

interface SuggestionWithState extends FormatSuggestion {
  state: SuggestionState;
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

const getStatusBadgeColor = (status: string): string => {
  const statusColors: Record<TemplateModelStatus, string> = {
    draft: "blue",
    training: "yellow",
    trained: "green",
    failed: "red",
  };
  return statusColors[status as TemplateModelStatus] || "gray";
};

export const ModelDetailPage: FC = () => {
  const navigate = useNavigate();
  const { modelId: routeModelId } = useParams<{ modelId: string }>();
  const [searchParams] = useSearchParams();

  if (!routeModelId) {
    return (
      <Center h="70vh">
        <Text c="red">Template Model ID is required</Text>
      </Center>
    );
  }
  const { templateModel, isLoading: isModelLoading } =
    useTemplateModel(routeModelId);
  const queryClient = useQueryClient();
  const {
    documents,
    isLoading: isDocumentsLoading,
    removeDocument,
    isRemoving,
  } = useTemplateModelDocuments(routeModelId);
  const {
    schema,
    isLoading: isSchemaLoading,
    addField,
    updateField,
    deleteField,
  } = useFieldSchema(routeModelId);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(
    null,
  );
  const fieldsFileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionWithState[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const {
    queue,
    isUploading,
    addFiles,
    removeFromQueue,
    clearQueue,
    uploadFiles,
  } = useUploadQueue<{
    labelingDocumentId: string;
    conversionFailed?: boolean;
  }>({
    onUploadSuccess: (item, result) => {
      if (result.conversionFailed) {
        notifications.show({
          title: "Stored but not converted to PDF",
          message: `${item.file.name} was saved but could not be normalized to PDF; OCR will not run.`,
          color: "orange",
        });
      } else {
        notifications.show({
          title: "Upload complete",
          message: `${item.file.name} was uploaded successfully.`,
          color: "green",
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["template-model-documents", routeModelId],
      });
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
      queue.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
    },
    [queue],
  );

  const suggestFromRun = searchParams.get("suggestFromRun");
  useEffect(() => {
    if (suggestFromRun && routeModelId) {
      void handleSuggestFormats([suggestFromRun]);
    }
    // Only run once on mount when the param is present
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestFromRun, routeModelId]);

  const handleDrop = (acceptedFiles: File[]) => {
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

  const uploadDocumentsFromFiles = async (
    itemsToUpload: UploadQueueItem<{
      labelingDocumentId: string;
      conversionFailed?: boolean;
    }>[],
  ) => {
    await uploadFiles(async (file) => {
      const base64 = await fileToBase64(file);
      const payload: LabelingUploadPayload = {
        title: file.name.replace(/\.[^/.]+$/, "") || "Untitled document",
        file: base64,
        file_type: file.type.includes("pdf") ? "pdf" : "image",
        original_filename: file.name,
        metadata: {
          size: file.size,
          lastModified: file.lastModified,
        },
        group_id: templateModel!.group_id,
      };

      const response = await apiService.post<{
        labelingDocument?: { id: string };
        code?: string;
      }>(`/template-models/${routeModelId}/upload`, payload);

      if (
        !response.success &&
        response.data &&
        typeof response.data === "object" &&
        "code" in response.data &&
        (response.data as { code?: string }).code === "conversion_failed" &&
        (response.data as { labelingDocument?: { id: string } })
          .labelingDocument
      ) {
        const data = response.data as {
          labelingDocument: { id: string };
          message?: string;
        };
        notifications.show({
          title: "Conversion failed",
          message:
            data.message ||
            "Document could not be converted to PDF. The file was saved but OCR will not run.",
          color: "orange",
        });
        return {
          labelingDocumentId: data.labelingDocument.id,
          conversionFailed: true,
        };
      }

      if (!response.success || !response.data) {
        throw new Error(response.message || "Upload failed");
      }

      const successData = response.data as {
        labelingDocument: { id: string };
      };
      return { labelingDocumentId: successData.labelingDocument.id };
    }, itemsToUpload);
  };

  const handleUpload = async () => {
    const pending = queue.filter(
      (item) => item.status === "queued" || item.status === "error",
    );

    if (pending.length === 0) {
      notifications.show({
        title: "Nothing to upload",
        message: "Add files first, then click upload.",
        color: "yellow",
      });
      return;
    }

    await uploadDocumentsFromFiles(pending);
  };

  const handleSaveField = (data: FieldFormData) => {
    if (editingField) {
      updateField({
        fieldId: editingField.id,
        data: {
          field_format: data.field_format,
          format_spec: data.format_spec,
          display_order: data.display_order,
        },
      });
    } else {
      addField({
        field_key: data.field_key!,
        field_type: data.field_type!,
        field_format: data.field_format,
        format_spec: data.format_spec,
        display_order: schema.length + 1,
      });
    }
    setSchemaEditorOpen(false);
    setEditingField(null);
  };

  const validFieldTypes = new Set(Object.values(FieldType) as string[]);

  const handleImportFields = async (file: File) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const fields: Array<{
        fieldKey: string;
        fieldType: string;
        fieldFormat?: string;
      }> = json.fields;
      if (!Array.isArray(fields) || fields.length === 0) {
        notifications.show({
          title: "Invalid file",
          message: 'Expected a fields.json with a non-empty "fields" array.',
          color: "red",
        });
        return;
      }

      const existingKeys = new Set(schema.map((f) => f.fieldKey));
      let added = 0;
      let skipped = 0;

      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (!f.fieldKey || !f.fieldType) {
          skipped++;
          continue;
        }
        if (existingKeys.has(f.fieldKey)) {
          skipped++;
          continue;
        }
        if (!validFieldTypes.has(f.fieldType)) {
          skipped++;
          continue;
        }
        addField({
          field_key: f.fieldKey,
          field_type: f.fieldType,
          field_format: f.fieldFormat,
          display_order: i,
        });
        existingKeys.add(f.fieldKey);
        added++;
      }

      notifications.show({
        title: "Import complete",
        message: `Added ${added} field(s)${skipped > 0 ? `, skipped ${skipped} (duplicate or invalid)` : ""}.`,
        color: "green",
      });
    } catch {
      notifications.show({
        title: "Import failed",
        message:
          "Could not parse file. Expected JSON with { fields: [...] } format.",
        color: "red",
      });
    } finally {
      setIsImporting(false);
      if (fieldsFileInputRef.current) {
        fieldsFileInputRef.current.value = "";
      }
    }
  };

  const handleSuggestFormats = async (benchmarkRunIds?: string[]) => {
    setIsSuggesting(true);
    try {
      const body: { benchmarkRunIds?: string[] } = {};
      if (benchmarkRunIds && benchmarkRunIds.length > 0) {
        body.benchmarkRunIds = benchmarkRunIds;
      }
      const response = await apiService.post<FormatSuggestion[]>(
        `/template-models/${routeModelId}/suggest-formats`,
        body,
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to fetch suggestions");
      }
      const results = response.data ?? [];
      setSuggestions(results.map((s) => ({ ...s, state: "pending" as const })));
      setSuggestionsOpen(true);
    } catch (err) {
      notifications.show({
        title: "Suggest Formats failed",
        message:
          err instanceof Error ? err.message : "An unexpected error occurred.",
        color: "red",
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSuggestionAccept = (fieldKey: string) => {
    const suggestion = suggestions.find((s) => s.fieldKey === fieldKey);
    if (!suggestion) return;

    const field = schema.find((f) => f.fieldKey === fieldKey);
    if (!field) {
      notifications.show({
        title: "Field not found",
        message: `Could not find field "${fieldKey}" in the schema.`,
        color: "red",
      });
      return;
    }

    updateField({
      fieldId: field.id,
      data: { format_spec: JSON.stringify(suggestion.formatSpec) },
    });

    setSuggestions((prev) =>
      prev.map((s) =>
        s.fieldKey === fieldKey ? { ...s, state: "accepted" as const } : s,
      ),
    );
  };

  const handleSuggestionReject = (fieldKey: string) => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.fieldKey === fieldKey ? { ...s, state: "rejected" as const } : s,
      ),
    );
  };

  if (isModelLoading) {
    return (
      <Center h="70vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate("/template-models")}
          >
            Back
          </Button>
          <Stack gap={2}>
            <Title order={2}>{templateModel?.name || "Template Model"}</Title>
            {templateModel?.model_id && (
              <Group gap="xs">
                <Code>{templateModel.model_id}</Code>
                <CopyButton value={templateModel.model_id}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? "Copied!" : "Copy model ID"}>
                      <ActionIcon
                        color={copied ? "green" : "gray"}
                        variant="subtle"
                        size="sm"
                        onClick={copy}
                      >
                        {copied ? (
                          <IconCheck size={14} />
                        ) : (
                          <IconCopy size={14} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            )}
            <Text size="sm" c="dimmed">
              {templateModel?.description ||
                "Manage template model documents and schema"}
            </Text>
          </Stack>
        </Group>
        <Badge
          variant="light"
          color={getStatusBadgeColor(templateModel?.status || "draft")}
        >
          {templateModel?.status || "draft"}
        </Badge>
      </Group>

      <Tabs defaultValue="documents">
        <Tabs.List>
          <Tabs.Tab value="documents">Documents</Tabs.Tab>
          <Tabs.Tab value="schema">Field Schema</Tabs.Tab>
          <Tabs.Tab value="export">Export</Tabs.Tab>
          <Tabs.Tab value="training">Training</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="documents" pt="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>Template model documents</Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setIsUploadOpen(true)}
              >
                Upload documents
              </Button>
            </Group>

            {isDocumentsLoading ? (
              <Loader />
            ) : documents.length === 0 ? (
              <Paper withBorder p="lg">
                <Text size="sm" c="dimmed">
                  No documents added to this template model yet.
                </Text>
              </Paper>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Document</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Labels</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {documents.map((doc) => {
                    const isReady =
                      doc.labeling_document.status === "completed_ocr";

                    return (
                      <Table.Tr key={doc.id}>
                        <Table.Td>
                          {doc.labeling_document.original_filename}
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            variant="light"
                            color={
                              doc.labeling_document.status === "completed_ocr"
                                ? "green"
                                : doc.labeling_document.status === "failed"
                                  ? "red"
                                  : "blue"
                            }
                          >
                            {doc.labeling_document.status === "pre_ocr"
                              ? "Pending OCR"
                              : doc.labeling_document.status === "ongoing_ocr"
                                ? "Processing OCR"
                                : doc.labeling_document.status ===
                                    "completed_ocr"
                                  ? "OCR Complete"
                                  : doc.labeling_document.status === "failed"
                                    ? "Failed"
                                    : doc.labeling_document.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{doc.labels?.length || 0}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() =>
                                navigate(
                                  `/template-models/${routeModelId}/document/${doc.labeling_document_id}`,
                                )
                              }
                              disabled={!isReady}
                              title={
                                isReady
                                  ? "Open for labeling"
                                  : "Wait for OCR to finish"
                              }
                            >
                              Open
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              leftSection={<IconTrash size={14} />}
                              onClick={() =>
                                removeDocument(doc.labeling_document_id)
                              }
                              loading={isRemoving}
                            >
                              Remove
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="schema" pt="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>Field schema</Text>
              <Group gap="xs">
                <input
                  type="file"
                  ref={fieldsFileInputRef}
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportFields(file);
                  }}
                />
                <Button
                  variant="light"
                  leftSection={<IconSparkles size={16} />}
                  onClick={() => handleSuggestFormats()}
                  loading={isSuggesting}
                >
                  Suggest Formats
                </Button>
                <Button
                  variant="light"
                  leftSection={<IconFileImport size={16} />}
                  onClick={() => fieldsFileInputRef.current?.click()}
                  loading={isImporting}
                >
                  Import fields.json
                </Button>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => {
                    setEditingField(null);
                    setSchemaEditorOpen(true);
                  }}
                >
                  Add field
                </Button>
              </Group>
            </Group>

            {isSchemaLoading ? (
              <Loader />
            ) : schema.length === 0 ? (
              <Paper withBorder p="lg">
                <Text size="sm" c="dimmed">
                  No fields defined yet.
                </Text>
              </Paper>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Key</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Format</Table.Th>
                    <Table.Th>Format Spec</Table.Th>
                    <Table.Th>Order</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {schema.map((field) => (
                    <Table.Tr key={field.id}>
                      <Table.Td>{field.fieldKey}</Table.Td>
                      <Table.Td>{field.fieldType}</Table.Td>
                      <Table.Td>{field.fieldFormat || "—"}</Table.Td>
                      <Table.Td>
                        {(() => {
                          if (!field.formatSpec) return "—";
                          try {
                            const spec = JSON.parse(field.formatSpec);
                            return spec.canonicalize || "—";
                          } catch {
                            return field.formatSpec;
                          }
                        })()}
                      </Table.Td>
                      <Table.Td>{field.displayOrder}</Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => {
                              setEditingField(field);
                              setSchemaEditorOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => deleteField(field.id)}
                          >
                            Delete
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="export" pt="md">
          <ExportPanel
            templateModelId={routeModelId}
            documents={documents.map((doc) => ({
              id: doc.labeling_document_id,
              name: doc.labeling_document.original_filename,
            }))}
          />
        </Tabs.Panel>

        <Tabs.Panel value="training" pt="md">
          <TrainingPanel
            templateModelId={routeModelId}
            templateModelModelId={templateModel?.model_id}
          />
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Upload documents to template model"
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Uploaded files are processed with prebuilt-layout OCR before they
            can be labeled.
          </Text>
          <Dropzone
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
                  Drag files or click to browse
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
              <Button onClick={handleUpload} loading={isUploading}>
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
            </Group>
          </Group>

          {queue.length > 0 && (
            <Paper shadow="sm" radius="md" p="lg" withBorder>
              <Group justify="space-between" mb="sm">
                <Text fw={600}>Upload queue</Text>
                <Badge>{queue.length} files</Badge>
              </Group>
              <Divider mb="sm" />
              <ScrollArea h={220} type="hover">
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
                                {item.file.type || "Unknown type"}
                              </Text>
                            </div>
                          </Group>
                          <Group gap="xs">
                            {item.result && (
                              <Tooltip label="Uploaded">
                                <IconUpload size={18} />
                              </Tooltip>
                            )}
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              onClick={() => removeFromQueue(item.id)}
                            >
                              Remove
                            </Button>
                          </Group>
                        </Group>
                        <Progress
                          value={item.progress}
                          mt="sm"
                          color={badge.color}
                          animated={item.status === "uploading"}
                        />
                        {item.message && (
                          <Text size="xs" c="dimmed" mt="xs">
                            {item.message}
                          </Text>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              </ScrollArea>
            </Paper>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        title="Format Suggestions"
        size="lg"
      >
        {(() => {
          const pendingCount = suggestions.filter(
            (s) => s.state === "pending",
          ).length;
          const totalCount = suggestions.length;
          const allHandled = totalCount > 0 && pendingCount === 0;

          if (totalCount === 0) {
            return (
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  No format suggestions could be generated. Ensure there is
                  enough HITL correction data.
                </Text>
                <Group justify="flex-end">
                  <Button onClick={() => setSuggestionsOpen(false)}>
                    Close
                  </Button>
                </Group>
              </Stack>
            );
          }

          if (allHandled) {
            return (
              <Stack gap="md">
                <Text fw={600} c="green">
                  All suggestions reviewed.
                </Text>
                <Group justify="flex-end">
                  <Button onClick={() => setSuggestionsOpen(false)}>
                    Close
                  </Button>
                </Group>
              </Stack>
            );
          }

          return (
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                {pendingCount} of {totalCount} suggestion
                {totalCount !== 1 ? "s" : ""} remaining
              </Text>
              <Stack gap="sm">
                {suggestions.map((suggestion) => {
                  const isAccepted = suggestion.state === "accepted";
                  const isRejected = suggestion.state === "rejected";
                  const isDone = isAccepted || isRejected;

                  return (
                    <Paper
                      key={suggestion.fieldKey}
                      withBorder
                      p="md"
                      style={{
                        opacity: isDone ? 0.6 : 1,
                      }}
                    >
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text fw={700}>{suggestion.fieldKey}</Text>
                          {isAccepted && (
                            <Badge
                              color="green"
                              variant="light"
                              leftSection={<IconCheck size={12} />}
                            >
                              Accepted
                            </Badge>
                          )}
                          {isRejected && (
                            <Badge
                              color="gray"
                              variant="light"
                              leftSection={<IconX size={12} />}
                            >
                              Rejected
                            </Badge>
                          )}
                        </Group>
                        <Group gap="xs" align="flex-start">
                          <Text size="sm" fw={600}>
                            Suggested spec:
                          </Text>
                          <Stack gap={2}>
                            <Text size="sm">
                              Canonicalize:{" "}
                              <Code>{suggestion.formatSpec.canonicalize}</Code>
                            </Text>
                            {suggestion.formatSpec.pattern && (
                              <Text size="sm">
                                Pattern:{" "}
                                <Code>{suggestion.formatSpec.pattern}</Code>
                              </Text>
                            )}
                            {suggestion.formatSpec.displayTemplate && (
                              <Text size="sm">
                                Display template:{" "}
                                <Code>
                                  {suggestion.formatSpec.displayTemplate}
                                </Code>
                              </Text>
                            )}
                          </Stack>
                        </Group>
                        <Text size="sm">
                          <Text span fw={600}>
                            Rationale:{" "}
                          </Text>
                          {suggestion.rationale}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Based on {suggestion.sampleCount} correction
                          {suggestion.sampleCount !== 1 ? "s" : ""}
                        </Text>
                        {!isDone && (
                          <Group gap="xs">
                            <Button
                              size="xs"
                              color="green"
                              variant="light"
                              leftSection={<IconCheck size={14} />}
                              onClick={() =>
                                handleSuggestionAccept(suggestion.fieldKey)
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              size="xs"
                              color="gray"
                              variant="subtle"
                              leftSection={<IconX size={14} />}
                              onClick={() =>
                                handleSuggestionReject(suggestion.fieldKey)
                              }
                            >
                              Reject
                            </Button>
                          </Group>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Stack>
          );
        })()}
      </Modal>

      <FieldSchemaEditor
        opened={schemaEditorOpen}
        onClose={() => {
          setSchemaEditorOpen(false);
          setEditingField(null);
        }}
        onSubmit={handleSaveField}
        initialValue={editingField}
      />
    </Stack>
  );
};
