import {
  Alert,
  Badge,
  Button,
  Loader,
  Modal,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconChecklist,
  IconFileDownload,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useDocumentOcr } from "../../data/hooks/useDocumentOcr";
import { Document, DocumentField, ExtractedFields } from "../../shared/types";
import { DocumentValidation } from "./DocumentValidation";
import { DocumentViewer } from "./DocumentViewer";

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
  const [showOverlays, setShowOverlays] = useState(true);

  useEffect(() => {
    // OCR result and error are handled by the component state
    // Removed console statements for lint compliance
  }, [ocrResult, ocrError]);

  useEffect(() => {
    if (opened && document) {
      void loadDocumentImage(document);
    } else if (!opened) {
      // Clean up object URL when modal closes
      if (imageUrl && imageUrl.startsWith("blob:")) {
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
      // Try to get the document file from the download endpoint
      const response = await fetch(`/api/documents/${doc.id}/download`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Failed to load document: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
        );
      }

      const blob = await response.blob();

      // Create object URL for the blob
      const url = URL.createObjectURL(blob);
      setImageUrl(url);

      // Clean up URL when component unmounts or modal closes
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load document";
      setError(errorMessage);

      if (doc.file_url) {
        setImageUrl(doc.file_url);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!imageUrl) {
      return;
    }

    const link = window.document.createElement("a");
    link.href = imageUrl;
    link.download = document?.original_filename || `document-${document?.id}`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const handleClose = () => {
    if (imageUrl && imageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl("");
    setError("");
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`Document Viewer - ${document?.title || "Document"}`}
      size="90vw"
      styles={{
        body: { height: "90vh", display: "flex", flexDirection: "column" },
        content: { height: "90vh" },
        overlay: { backgroundColor: "rgba(0, 0, 0, 0.8)" },
      }}
      withinPortal
      zIndex={9999}
      closeOnClickOutside={false}
      closeOnEscape={false}
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
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
            <div>
              <h3 className="font-semibold text-lg">{document.title}</h3>
              <p className="text-sm text-gray-600">
                {document.original_filename}
                {document.model_id && (
                  <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Model: {document.model_id}
                  </span>
                )}
              </p>
            </div>
            <Button
              variant="outline"
              leftSection={<IconFileDownload size={16} />}
              onClick={handleDownload}
              disabled={!imageUrl}
            >
              Download
            </Button>
          </div>
          <Tabs
            defaultValue={
              document.status === "needs_validation" || document.needsReview
                ? "review"
                : "viewer"
            }
            className="flex-1 min-h-0 flex flex-col"
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
              {document &&
                (document.status === "needs_validation" ||
                  document.needsReview) && (
                  <Tabs.Tab
                    value="review"
                    leftSection={<IconChecklist size={16} />}
                  >
                    Review & Approve
                  </Tabs.Tab>
                )}
            </Tabs.List>

            <Tabs.Panel value="viewer" className="flex-1 min-h-0">
              {imageUrl && document ? (
                <DocumentViewer
                  imageUrl={imageUrl}
                  extractedFields={ocrResult?.ocr_result?.keyValuePairs}
                  pageNumber={1}
                  showOverlays={showOverlays}
                  onToggleOverlays={() => setShowOverlays(!showOverlays)}
                  fileType={document.file_type}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                    Document file is not available for preview. The backend may
                    not expose the raw file stream.
                  </Alert>
                </div>
              )}
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
            {document &&
              (document.status === "needs_validation" ||
                document.needsReview) && (
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
          </Tabs>
        </div>
      )}
    </Modal>
  );
}
