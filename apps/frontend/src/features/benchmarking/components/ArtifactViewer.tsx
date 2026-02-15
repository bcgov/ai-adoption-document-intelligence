import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
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
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconDownload,
  IconExternalLink,
  IconX,
} from "@tabler/icons-react";
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
  mlflowExperimentId?: string;
  mlflowRunId?: string;
  onClose: () => void;
}

export function ArtifactViewer({
  artifact,
  projectId,
  mlflowExperimentId,
  mlflowRunId,
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
          // For images, we'll use a blob URL
          const response = await apiService.get(
            `/benchmark/projects/${projectId}/runs/${artifact.runId}/artifacts/${artifact.id}/content`,
            { responseType: "blob" },
          );
          const url = URL.createObjectURL(response.data);
          setImageUrl(url);
        }
        // Handle JSON
        else if (
          mimeType.includes("json") ||
          artifact.path.endsWith(".json")
        ) {
          const response = await apiService.get(
            `/benchmark/projects/${projectId}/runs/${artifact.runId}/artifacts/${artifact.id}/content`,
            { responseType: "text" },
          );
          // Try to format JSON
          try {
            const parsed = JSON.parse(response.data);
            setContent(JSON.stringify(parsed, null, 2));
          } catch {
            setContent(response.data);
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
          setContent(response.data);
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

      const url = URL.createObjectURL(response.data);
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

  const getMlflowArtifactUrl = () => {
    if (!mlflowExperimentId || !mlflowRunId || !artifact) return null;

    // MLflow artifact deep-link format
    const mlflowUrl = process.env.MLFLOW_URL || "http://localhost:5000";
    return `${mlflowUrl}/#/experiments/${mlflowExperimentId}/runs/${mlflowRunId}/artifacts/${artifact.path}`;
  };

  if (!artifact) {
    return null;
  }

  const mlflowUrl = getMlflowArtifactUrl();
  const isImage = artifact.mimeType.toLowerCase().startsWith("image/");
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
      title={
        <Group justify="space-between" style={{ flex: 1, marginRight: 16 }}>
          <Stack gap={0}>
            <Text fw={600} size="lg">
              Artifact Viewer
            </Text>
            <Code size="xs">{artifact.path}</Code>
          </Stack>
        </Group>
      }
    >
      <Stack gap="md" h="calc(100vh - 80px)">
        {/* Artifact Metadata */}
        <Card withBorder>
          <Stack gap="xs">
            <Group>
              <Text size="sm" fw={500}>
                Type:
              </Text>
              <Code size="sm">{artifact.type}</Code>
            </Group>
            <Group>
              <Text size="sm" fw={500}>
                MIME Type:
              </Text>
              <Code size="sm">{artifact.mimeType}</Code>
            </Group>
            {artifact.sampleId && (
              <Group>
                <Text size="sm" fw={500}>
                  Sample ID:
                </Text>
                <Code size="sm">{artifact.sampleId}</Code>
              </Group>
            )}
            {artifact.nodeId && (
              <Group>
                <Text size="sm" fw={500}>
                  Node ID:
                </Text>
                <Code size="sm">{artifact.nodeId}</Code>
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
          >
            Download
          </Button>
          {mlflowUrl && (
            <Button
              leftSection={<IconExternalLink size={16} />}
              variant="light"
              component="a"
              href={mlflowUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in MLflow
            </Button>
          )}
        </Group>

        {/* Content Viewer */}
        <Card withBorder style={{ flex: 1, overflow: "hidden" }}>
          {loading ? (
            <Center h={300}>
              <Loader />
            </Center>
          ) : error ? (
            <Alert
              color="red"
              title="Error Loading Artifact"
              icon={<IconAlertCircle />}
            >
              {error}
            </Alert>
          ) : imageUrl ? (
            <ScrollArea h="100%">
              <img
                src={imageUrl}
                alt={artifact.path}
                style={{ maxWidth: "100%", height: "auto" }}
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
              />
            </ScrollArea>
          ) : isPdf ? (
            <Alert color="blue" title="PDF Viewer" icon={<IconAlertCircle />}>
              PDF viewing is not yet implemented. Please download the file or
              open it in MLflow.
            </Alert>
          ) : (
            <Alert
              color="blue"
              title="Preview Not Available"
              icon={<IconAlertCircle />}
            >
              This artifact type cannot be previewed in the browser. Please
              download the file or open it in MLflow.
            </Alert>
          )}
        </Card>
      </Stack>
    </Drawer>
  );
}
