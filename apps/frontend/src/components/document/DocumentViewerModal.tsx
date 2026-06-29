import {
  IconAlertCircle,
  IconChecklist,
  IconFileDownload,
  IconInfoCircle,
  IconRotateClockwise,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useDocumentOcr } from "../../data/hooks/useDocumentOcr";
import { Document } from "../../shared/types";
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
} from "../../ui";
import { DocumentValidation } from "./DocumentValidation";
import { DocumentViewer } from "./DocumentViewer";
import OcrResults from "./OcrResults";

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

export function DocumentViewerModal({
  document,
  opened,
  onClose,
}: DocumentViewerModalProps) {
  const documentId = document?.id;
  // A purged document's blobs were removed per its workflow's retention policy.
  // The original/normalized PDF is gone, but the extracted OCR data is retained,
  // so we skip the (failing) blob fetch and surface the retained data instead.
  const isPurged = !!document?.purged_at;
  const { data: ocrResult } = useDocumentOcr(documentId);
  const ocr = ocrResult?.ocr_result;
  // Read/layout models save their output as `content` (markdown/text) with no
  // keyValuePairs; field-extraction models save keyValuePairs. The OCR Results
  // tab surfaces whichever is present.
  const hasKeyValues = !!ocr?.keyValuePairs;
  const hasOcrText = !!(ocr?.content?.markdown || ocr?.content?.text);
  const hasOcrData = hasKeyValues || hasOcrText;
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [rotation, setRotation] = useState(0);
  const showOverlays = true;

  useEffect(() => {
    if (opened && document && !document.purged_at) {
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
      centered
      fullBleedBody
      darkOverlay
      title={
        <Group
          justify="space-between"
          pr={30}
          style={{ width: "100%", flex: 1 }}
          wrap="nowrap"
        >
          <Text size="lg" fw={600}>
            {document?.title || "Document"}
          </Text>
          <Group gap="xs">
            <Tooltip label="Rotate 90°" position="bottom" withArrow>
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
            <Tooltip label="Download document" position="bottom" withArrow>
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
        body: {
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
        content: { height: "90vh", overflow: "hidden" },
        header: { paddingRight: "1rem" },
        title: { flex: 1, width: "100%" },
      }}
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
                : isPurged
                  ? hasOcrData
                    ? "ocr-results"
                    : "details"
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
            <Tabs.List
              className="flex-shrink-0"
              style={{
                paddingLeft: "var(--layout-padding-large)",
                paddingRight: "var(--layout-padding-large)",
                paddingTop: "var(--layout-padding-small)",
              }}
            >
              <Tabs.Tab
                value="viewer"
                leftSection={<IconFileDownload size={16} />}
              >
                Document Viewer
              </Tabs.Tab>
              {hasOcrData && (
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
                  extractedFields={ocr?.keyValuePairs}
                  pageNumber={1}
                  showOverlays={showOverlays}
                  rotation={rotation}
                />
              ) : isPurged ? (
                <div className="p-4">
                  <Alert
                    color="blue"
                    icon={<IconInfoCircle size={16} />}
                    title="Original document removed"
                  >
                    This document’s original file was removed per its workflow’s
                    retention policy
                    {document.purged_at
                      ? ` on ${new Date(document.purged_at).toLocaleString()}`
                      : ""}
                    . The extracted data is retained
                    {hasOcrData ? " — see the OCR Results tab." : "."}
                  </Alert>
                </div>
              ) : null}
            </Tabs.Panel>
            {hasOcrData && (
              <Tabs.Panel
                value="ocr-results"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <OcrResults ocr={ocr ?? null} />
              </Tabs.Panel>
            )}
            {(document?.status === "awaiting_review" ||
              document?.needsReview) && (
              <Tabs.Panel
                value="review"
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    padding: "1rem",
                    paddingBottom: "3rem",
                  }}
                >
                  {ocr ? (
                    <DocumentValidation
                      document={document}
                      ocrResult={ocr}
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
                </div>
              </Tabs.Panel>
            )}
            <Tabs.Panel
              value="details"
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  padding: "1rem",
                  paddingBottom: "3rem",
                }}
              >
                <Stack gap="md">
                  <div>
                    <Title order={4} mb="xs">
                      File Information
                    </Title>
                    <Table
                      withTableBorder
                      withColumnBorders
                      style={{ tableLayout: "fixed", width: "100%" }}
                    >
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td fw={600} w="30%">
                            Document Name
                          </Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            {document.title}
                          </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td fw={600}>Original Filename</Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            {document.original_filename}
                          </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td fw={600}>Original File Type</Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            {document.file_type}
                          </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td fw={600}>File Size</Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            {formatFileSize(document.file_size)}
                          </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td fw={600}>Source</Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
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
                    <Table
                      withTableBorder
                      withColumnBorders
                      style={{ tableLayout: "fixed", width: "100%" }}
                    >
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td fw={600} w="30%">
                            Status
                          </Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            <Badge
                              color={
                                document.status === "complete"
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
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            {document.model_id}
                          </Table.Td>
                        </Table.Tr>
                        {document.workflow_name && (
                          <Table.Tr>
                            <Table.Td fw={600}>Workflow</Table.Td>
                            <Table.Td style={{ wordBreak: "break-word" }}>
                              {document.workflow_name}
                            </Table.Td>
                          </Table.Tr>
                        )}
                        <Table.Tr>
                          <Table.Td fw={600}>Upload Date</Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            {new Date(document.created_at).toLocaleString()}
                          </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td fw={600}>Last Updated</Table.Td>
                          <Table.Td style={{ wordBreak: "break-word" }}>
                            {new Date(document.updated_at).toLocaleString()}
                          </Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </div>
                </Stack>
              </div>
            </Tabs.Panel>
          </Tabs>
        </div>
      )}
    </Modal>
  );
}
