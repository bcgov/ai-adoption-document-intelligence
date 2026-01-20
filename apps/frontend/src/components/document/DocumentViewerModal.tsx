import { Alert, Button, Loader, Modal } from "@mantine/core";
import { IconAlertCircle, IconFileDownload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useDocumentOcr } from "../../data/hooks/useDocumentOcr";
import { Document } from "../../shared/types";
import { DocumentViewer } from "./DocumentViewer";

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
  const { data: ocrResult, isLoading: ocrLoading, error: ocrError } = useDocumentOcr(documentId);
  const { getAccessToken } = useAuth();
  
  useEffect(() => {
    if (ocrResult) {
      console.debug("[DocumentViewer] OCR result loaded", {
        hasOcrResult: !!ocrResult.ocr_result,
        hasKeyValuePairs: !!ocrResult.ocr_result?.keyValuePairs,
        keyValuePairsType: typeof ocrResult.ocr_result?.keyValuePairs,
        keyValuePairsKeys: ocrResult.ocr_result?.keyValuePairs ? Object.keys(ocrResult.ocr_result.keyValuePairs) : [],
      });
    }
    if (ocrError) {
      console.error("[DocumentViewer] OCR result error:", ocrError);
    }
  }, [ocrResult, ocrError]);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [showOverlays, setShowOverlays] = useState(true);

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
      const token = getAccessToken?.() ?? null;
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      console.debug("[DocumentViewer] Loading document image", {
        documentId: doc.id,
        filePath: doc.file_path,
        hasToken: !!token,
      });

      // Try to get the document file from the download endpoint
      const response = await fetch(`/api/documents/${doc.id}/download`, {
        headers,
      });

      console.debug("[DocumentViewer] Download response", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("[DocumentViewer] Download failed", {
          status: response.status,
          statusText: response.statusText,
          errorText,
        });
        throw new Error(
          `Failed to load document: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
        );
      }

      const blob = await response.blob();
      console.debug("[DocumentViewer] Blob created", {
        size: blob.size,
        type: blob.type,
      });

      // Create object URL for the blob
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      console.debug("[DocumentViewer] Image URL created", { url });

      // Clean up URL when component unmounts or modal closes
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      console.error("[DocumentViewer] Error loading document:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to load document";
      setError(errorMessage);

      if (doc.file_url) {
        console.debug("[DocumentViewer] Falling back to file_url", {
          file_url: doc.file_url,
        });
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
          <div className="flex-1 min-h-0">
            {imageUrl ? (
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
          </div>
        </div>
      )}
    </Modal>
  );
}
