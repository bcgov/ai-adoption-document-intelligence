import {
  Avatar,
  Badge,
  Button,
  Center,
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
  IconFileDescription,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { FC, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type UploadQueueItem,
  useUploadQueue,
} from "@/data/hooks/useUploadQueue";
import { apiService } from "@/data/services/api.service";
import type { FieldDefinition } from "../../core/types/field";
import { ExportPanel } from "../components/ExportPanel";
import { FieldSchemaEditor } from "../components/FieldSchemaEditor";
import { TrainingPanel } from "../components/TrainingPanel";
import { useFieldSchema } from "../hooks/useFieldSchema";
import { useProject, useProjectDocuments } from "../hooks/useProjects";

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
  display_order?: number;
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

export const ProjectDetailPage: FC = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return (
      <Center h="70vh">
        <Text c="red">Project ID is required</Text>
      </Center>
    );
  }
  const { project, isLoading: isProjectLoading } = useProject(projectId);
  const queryClient = useQueryClient();
  const {
    documents,
    isLoading: isDocumentsLoading,
    removeDocument,
    isRemoving,
  } = useProjectDocuments(projectId);
  const {
    schema,
    isLoading: isSchemaLoading,
    addField,
    updateField,
    deleteField,
  } = useFieldSchema(projectId);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(
    null,
  );
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
        queryKey: ["labeling-project-documents", projectId],
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
      queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [queue],
  );

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
        group_id: project!.group_id,
      };

      const response = await apiService.post<{
        labelingDocument?: { id: string };
        code?: string;
      }>(`/labeling/projects/${projectId}/upload`, payload);

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
          display_order: data.display_order,
        },
      });
    } else {
      addField({
        field_key: data.field_key!,
        field_type: data.field_type!,
        field_format: data.field_format,
        display_order: schema.length + 1,
      });
    }
    setSchemaEditorOpen(false);
    setEditingField(null);
  };

  if (isProjectLoading) {
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
            onClick={() => navigate("/labeling")}
          >
            Back
          </Button>
          <Stack gap={2}>
            <Title order={2}>{project?.name || "Project"}</Title>
            <Text size="sm" c="dimmed">
              {project?.description || "Manage project documents and schema"}
            </Text>
          </Stack>
        </Group>
        <Badge variant="light">{project?.status || "active"}</Badge>
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
              <Text fw={600}>Project documents</Text>
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
                  No documents added to this project yet.
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
                          <Stack gap={2}>
                            <Badge size="sm" variant="light">
                              {doc.labeling_document.status}
                            </Badge>
                            {!isReady && (
                              <Text size="xs" c="dimmed">
                                OCR running
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td>{doc.labels?.length || 0}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() =>
                                navigate(
                                  `/labeling/${projectId}/document/${doc.labeling_document_id}`,
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
                    <Table.Th>Order</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {schema.map((field) => (
                    <Table.Tr key={field.id}>
                      <Table.Td>{field.fieldKey}</Table.Td>
                      <Table.Td>{field.fieldType}</Table.Td>
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
            projectId={projectId}
            documents={documents.map((doc) => ({
              id: doc.labeling_document_id,
              name: doc.labeling_document.original_filename,
            }))}
          />
        </Tabs.Panel>

        <Tabs.Panel value="training" pt="md">
          <TrainingPanel projectId={projectId} />
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Upload documents to project"
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
