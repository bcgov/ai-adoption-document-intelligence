import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconChecklist,
  IconFileDownload,
  IconInfoCircle,
  IconRotateClockwise,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useDocumentOcr } from "../../data/hooks/useDocumentOcr";
import { Document, DocumentField, ExtractedFields } from "../../shared/types";
import { DocumentValidation } from "./DocumentValidation";
import { DocumentViewer } from "./DocumentViewer";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    // Less than 1 MB
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    // Less than 1 GB
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface DocumentViewerModalProps {
  document: Document | null;
  opened: boolean;
  onClose: () => void;
}

function getFieldDisplayValue(field: DocumentField): string {
  if (field.valueSelectionMark !== undefined) {
    return field.valueSelectionMark === "selected"
      ? "☑ Selected"
      : "☐ Unselected";
  }
  if (field.valueNumber !== undefined) {
    return field.valueNumber.toString();
  }
  if (field.valueDate !== undefined) {
    return field.valueDate;
  }
  if (field.valueString !== undefined) {
    return field.valueString;
  }
  return field.content || "—";
}

function ExtractedFieldsTable({ fields }: { fields: ExtractedFields }) {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return <Text c="dimmed">No fields extracted.</Text>;
  }

  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Field</Table.Th>
          <Table.Th>Value</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Confidence</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map(([name, field]) => (
          <Table.Tr key={name}>
            <Table.Td>
              <Text size="sm" fw={500}>
                {name}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{getFieldDisplayValue(field)}</Text>
            </Table.Td>
            <Table.Td>
              <Badge size="xs" variant="light">
                {field.type}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Text
                size="sm"
                c={
                  field.confidence >= 0.9
                    ? "green"
                    : field.confidence >= 0.7
                      ? "yellow"
                      : "red"
                }
              >
                {(field.confidence * 100).toFixed(1)}%
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function DocumentViewerModal({
  document,
  opened,
  onClose,
}: DocumentViewerModalProps) {
  const documentId = document?.id;
  const { data: ocrResult, error: ocrError } = useDocumentOcr(documentId);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [rotation, setRotation] = useState(0);
  const showOverlays = true;

  useEffect(() => {
    // OCR result and error are handled by the component state
    // Removed console statements for lint compliance
  }, [ocrResult, ocrError]);

  useEffect(() => {
    if (opened && document) {
      void loadDocumentImage(document);
    } else if (!opened) {
      // Clean up object URL when modal closes
      if (imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imageUrl);
      }
      setImageUrl("");
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, document]);

  const loadDocumentImage = async (doc: Document) => {
    setLoading(true);
    setError("");

    try {
      // Try normalized PDF first; fall back to original for pre-normalization documents
      let response = await fetch(`/api/documents/${doc.id}/view`, {
        credentials: "include",
      });
      if (!response.ok) {
        response = await fetch(`/api/documents/${doc.id}/download`, {
          credentials: "include",
        });
      }

      if (!response.ok) {
        throw new Error(
          `Failed to load document: ${response.status} ${response.statusText}`,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load document";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!document?.id) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/documents/${document.id}/download`, {
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement("a");
        link.href = url;
        link.download = document.original_filename || `document-${document.id}`;
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        // Download failed silently; user can retry
      }
    })();
  };

  const handleClose = () => {
    if (imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl("");
    setError("");
    setRotation(0);
    onClose();
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group
          justify="space-between"
          style={{ width: "100%", flex: 1 }}
          wrap="nowrap"
        >
          <Text size="lg" fw={600}>
            {document?.title || "Document"}
          </Text>
          <Group gap="xs">
            <Tooltip
              label="Rotate 90°"
              position="bottom"
              withArrow
              withinPortal
              zIndex={10000}
            >
              <ActionIcon
                variant="subtle"
                onClick={handleRotate}
                disabled={!imageUrl}
                size="lg"
                aria-label="Rotate document"
              >
                <IconRotateClockwise size={20} />
              </ActionIcon>
            </Tooltip>
            <Tooltip
              label="Download document"
              position="bottom"
              withArrow
              withinPortal
              zIndex={10000}
            >
              <ActionIcon
                variant="subtle"
                onClick={handleDownload}
                disabled={!imageUrl || !document}
                size="lg"
                mr="md"
                aria-label="Download document"
              >
                <IconFileDownload size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      }
      size="90vw"
      styles={{
        body: { height: "90vh", display: "flex", flexDirection: "column" },
        content: { height: "90vh" },
        overlay: { backgroundColor: "rgba(0, 0, 0, 0.8)" },
        header: { paddingRight: "1rem" },
        title: { flex: 1, width: "100%" },
      }}
      withinPortal
      zIndex={9999}
      closeOnClickOutside={true}
      closeOnEscape={true}
    >
      {!document ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">No document selected</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader size="lg" />
            <p className="mt-4 text-gray-600">Loading document...</p>
          </div>
        </div>
      ) : error && !imageUrl ? (
        <div className="p-4">
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0,
          }}
        >
          <Tabs
            defaultValue={
              document.status === "awaiting_review" || document.needsReview
                ? "review"
                : "viewer"
            }
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Tabs.List className="flex-shrink-0 px-4 pt-2">
              <Tabs.Tab
                value="viewer"
                leftSection={<IconFileDownload size={16} />}
              >
                Document Viewer
              </Tabs.Tab>
              {ocrResult?.ocr_result?.keyValuePairs && (
                <Tabs.Tab
                  value="ocr-results"
                  leftSection={<IconChecklist size={16} />}
                >
                  OCR Results
                </Tabs.Tab>
              )}
              {(document?.status === "awaiting_review" ||
                document?.needsReview) && (
                <Tabs.Tab
                  value="review"
                  leftSection={<IconChecklist size={16} />}
                >
                  Review & Approve
                </Tabs.Tab>
              )}
              <Tabs.Tab
                value="details"
                leftSection={<IconInfoCircle size={16} />}
              >
                Details
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel
              value="viewer"
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {imageUrl ? (
                <DocumentViewer
                  imageUrl={imageUrl}
                  extractedFields={ocrResult?.ocr_result?.keyValuePairs}
                  pageNumber={1}
                  showOverlays={showOverlays}
                  rotation={rotation}
                />
              ) : null}
            </Tabs.Panel>

            {ocrResult?.ocr_result?.keyValuePairs && (
              <Tabs.Panel
                value="ocr-results"
                className="flex-1 min-h-0 overflow-auto p-4"
              >
                <ExtractedFieldsTable
                  fields={ocrResult.ocr_result.keyValuePairs}
                />
              </Tabs.Panel>
            )}
            {(document?.status === "awaiting_review" ||
              document?.needsReview) && (
              <Tabs.Panel
                value="review"
                className="flex-1 min-h-0 overflow-auto p-4"
              >
                {ocrResult?.ocr_result ? (
                  <DocumentValidation
                    document={document}
                    ocrResult={ocrResult.ocr_result}
                    onValidationComplete={() => {
                      // Refresh the document list and close modal after a short delay
                      setTimeout(() => {
                        handleClose();
                      }, 1000);
                    }}
                  />
                ) : (
                  <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                    OCR results are not available yet. Please wait for
                    processing to complete.
                  </Alert>
                )}
              </Tabs.Panel>
            )}
            <Tabs.Panel
              value="details"
              className="flex-1 min-h-0 overflow-auto p-4"
            >
              <Stack gap="md">
                <div>
                  <Title order={4} mb="xs">
                    File Information
                  </Title>
                  <Table withTableBorder withColumnBorders>
                    <Table.Tbody>
                      <Table.Tr>
                        <Table.Td fw={600} w="30%">
                          Document Name
                        </Table.Td>
                        <Table.Td>{document.title}</Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td fw={600}>Original Filename</Table.Td>
                        <Table.Td>{document.original_filename}</Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td fw={600}>Original File Type</Table.Td>
                        <Table.Td>{document.file_type}</Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td fw={600}>File Size</Table.Td>
                        <Table.Td>
                          {formatFileSize(document.file_size)}
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td fw={600}>Source</Table.Td>
                        <Table.Td>
                          <Badge variant="light">{document.source}</Badge>
                        </Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </div>

                <div>
                  <Title order={4} mb="xs">
                    Processing Information
                  </Title>
                  <Table withTableBorder withColumnBorders>
                    <Table.Tbody>
                      <Table.Tr>
                        <Table.Td fw={600} w="30%">
                          Status
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              document.status === "ready"
                                ? "green"
                                : document.status === "failed"
                                  ? "red"
                                  : document.status === "awaiting_review"
                                    ? "yellow"
                                    : "blue"
                            }
                          >
                            {document.status}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td fw={600}>Model</Table.Td>
                        <Table.Td>{document.model_id}</Table.Td>
                      </Table.Tr>
                      {document.workflow_name && (
                        <Table.Tr>
                          <Table.Td fw={600}>Workflow</Table.Td>
                          <Table.Td>{document.workflow_name}</Table.Td>
                        </Table.Tr>
                      )}
                      <Table.Tr>
                        <Table.Td fw={600}>Upload Date</Table.Td>
                        <Table.Td>
                          {new Date(document.created_at).toLocaleString()}
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td fw={600}>Last Updated</Table.Td>
                        <Table.Td>
                          {new Date(document.updated_at).toLocaleString()}
                        </Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </div>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </div>
      )}
    </Modal>
  );
}
