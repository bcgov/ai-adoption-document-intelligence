import {
  Alert,
  Button,
  Card,
  Center,
  Code,
  Drawer,
  Group,
  JsonInput,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconAlertCircle, IconDownload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { apiService } from "@/data/services/api.service";

interface ArtifactViewerProps {
  artifact: {
    id: string;
    runId: string;
    type: string;
    path: string;
    sampleId: string | null;
    nodeId: string | null;
    sizeBytes: string;
    mimeType: string;
    createdAt: string;
  } | null;
  projectId: string;
  onClose: () => void;
}

export function ArtifactViewer({
  artifact,
  projectId,
  onClose,
}: ArtifactViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact) {
      setContent(null);
      setImageUrl(null);
      setError(null);
      return;
    }

    const loadArtifact = async () => {
      setLoading(true);
      setError(null);
      setContent(null);
      setImageUrl(null);

      try {
        const mimeType = artifact.mimeType.toLowerCase();

        // Handle images
        if (mimeType.startsWith("image/")) {
          // For images, we'll use a blob URL or data URL
          const response = await apiService.get(
            `/benchmark/projects/${projectId}/runs/${artifact.runId}/artifacts/${artifact.id}/content`,
            { responseType: "blob" },
          );

          // Check for API errors
          if (!response.success) {
            throw new Error(response.message || "Failed to load artifact");
          }

          // Convert to object URL or data URL depending on response type
          try {
            if (response.data instanceof Blob) {
              const url = URL.createObjectURL(response.data);
              setImageUrl(url);
            } else {
              // Fallback for mocked responses: convert to data URL
              const blob = new Blob([response.data as BlobPart], {
                type: mimeType,
              });
              const url = URL.createObjectURL(blob);
              setImageUrl(url);
            }
          } catch (err) {
            throw new Error(
              `Failed to create image URL: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }
        // Handle JSON
        else if (mimeType.includes("json") || artifact.path.endsWith(".json")) {
          const response = await apiService.get(
            `/benchmark/projects/${projectId}/runs/${artifact.runId}/artifacts/${artifact.id}/content`,
            { responseType: "text" },
          );

          // Check for API errors
          if (!response.success) {
            throw new Error(response.message || "Failed to load artifact");
          }

          // Handle both auto-parsed objects and string responses
          // Axios automatically parses JSON when Content-Type is application/json
          const data = response.data;
          if (typeof data === "object") {
            setContent(JSON.stringify(data, null, 2));
          } else if (typeof data === "string") {
            try {
              const parsed = JSON.parse(data);
              setContent(JSON.stringify(parsed, null, 2));
            } catch {
              setContent(data);
            }
          } else {
            setContent(String(data));
          }
        }
        // Handle text-based files
        else if (
          mimeType.startsWith("text/") ||
          artifact.path.endsWith(".txt") ||
          artifact.path.endsWith(".log") ||
          artifact.path.endsWith(".csv")
        ) {
          const response = await apiService.get(
            `/benchmark/projects/${projectId}/runs/${artifact.runId}/artifacts/${artifact.id}/content`,
            { responseType: "text" },
          );

          // Check for API errors
          if (!response.success) {
            throw new Error(response.message || "Failed to load artifact");
          }

          setContent(response.data as string);
        }
        // Default: show download option
        else {
          setContent(null);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load artifact",
        );
      } finally {
        setLoading(false);
      }
    };

    loadArtifact();

    // Cleanup blob URLs
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [artifact, projectId]);

  const handleDownload = async () => {
    if (!artifact) return;

    try {
      const response = await apiService.get(
        `/benchmark/projects/${projectId}/runs/${artifact.runId}/artifacts/${artifact.id}/content`,
        { responseType: "blob" },
      );

      // Check for API errors
      if (!response.success) {
        throw new Error(response.message || "Failed to download artifact");
      }

      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = artifact.path.split("/").pop() || "artifact";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to download artifact",
      );
    }
  };

  if (!artifact) {
    return null;
  }

  const isJson =
    artifact.mimeType.toLowerCase().includes("json") ||
    artifact.path.endsWith(".json");
  const isText =
    artifact.mimeType.toLowerCase().startsWith("text/") ||
    artifact.path.endsWith(".txt") ||
    artifact.path.endsWith(".log") ||
    artifact.path.endsWith(".csv");
  const isPdf =
    artifact.mimeType.toLowerCase() === "application/pdf" ||
    artifact.path.endsWith(".pdf");

  return (
    <Drawer
      opened={!!artifact}
      onClose={onClose}
      position="right"
      size="xl"
      data-testid="artifact-viewer-drawer"
      title={
        <Group justify="space-between" style={{ flex: 1, marginRight: 16 }}>
          <Stack gap={0}>
            <Text fw={600} size="lg" data-testid="artifact-viewer-title">
              Artifact Viewer
            </Text>
            <Code fz="xs" data-testid="artifact-path-display">
              {artifact.path}
            </Code>
          </Stack>
        </Group>
      }
    >
      <Stack gap="md" h="calc(100vh - 80px)">
        {/* Artifact Metadata */}
        <Card withBorder data-testid="artifact-metadata-card">
          <Stack gap="xs">
            <Group>
              <Text size="sm" fw={500}>
                Type:
              </Text>
              <Code fz="sm" data-testid="artifact-type-value">
                {artifact.type}
              </Code>
            </Group>
            <Group>
              <Text size="sm" fw={500}>
                MIME Type:
              </Text>
              <Code fz="sm" data-testid="artifact-mime-type-value">
                {artifact.mimeType}
              </Code>
            </Group>
            {artifact.sampleId && (
              <Group>
                <Text size="sm" fw={500}>
                  Sample ID:
                </Text>
                <Code fz="sm" data-testid="artifact-sample-id-value">
                  {artifact.sampleId}
                </Code>
              </Group>
            )}
            {artifact.nodeId && (
              <Group>
                <Text size="sm" fw={500}>
                  Node ID:
                </Text>
                <Code fz="sm" data-testid="artifact-node-id-value">
                  {artifact.nodeId}
                </Code>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Actions */}
        <Group>
          <Button
            leftSection={<IconDownload size={16} />}
            variant="light"
            onClick={handleDownload}
            data-testid="download-artifact-btn"
          >
            Download
          </Button>
        </Group>

        {/* Content Viewer */}
        <Card
          withBorder
          style={{ flex: 1, overflow: "hidden" }}
          data-testid="artifact-content-card"
        >
          {loading ? (
            <Center h={300}>
              <Loader data-testid="artifact-loading-spinner" />
            </Center>
          ) : error ? (
            <Alert
              color="red"
              title="Error Loading Artifact"
              icon={<IconAlertCircle />}
              data-testid="artifact-error-alert"
            >
              {error}
            </Alert>
          ) : imageUrl ? (
            <ScrollArea h="100%">
              <img
                src={imageUrl}
                alt={artifact.path}
                style={{ maxWidth: "100%", height: "auto" }}
                data-testid="artifact-image-viewer"
              />
            </ScrollArea>
          ) : isJson && content ? (
            <ScrollArea h="100%">
              <JsonInput
                value={content}
                readOnly
                autosize
                minRows={10}
                maxRows={50}
                data-testid="artifact-json-viewer"
              />
            </ScrollArea>
          ) : isText && content ? (
            <ScrollArea h="100%">
              <Textarea
                value={content}
                readOnly
                autosize
                minRows={10}
                maxRows={50}
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontSize: "12px",
                  },
                }}
                data-testid="artifact-text-viewer"
              />
            </ScrollArea>
          ) : isPdf ? (
            <Alert
              color="blue"
              title="PDF Viewer"
              icon={<IconAlertCircle />}
              data-testid="artifact-pdf-alert"
            >
              PDF viewing is not yet implemented. Please download the file to
              view it.
            </Alert>
          ) : (
            <Alert
              color="blue"
              title="Preview Not Available"
              icon={<IconAlertCircle />}
              data-testid="artifact-unsupported-alert"
            >
              This artifact type cannot be previewed in the browser. Please
              download the file to view it.
            </Alert>
          )}
        </Card>
      </Stack>
    </Drawer>
  );
}
