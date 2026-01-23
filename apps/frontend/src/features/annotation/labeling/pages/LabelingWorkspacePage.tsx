import { FC, useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconDeviceFloppy, IconPencil } from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import { useAuth } from "@/auth/AuthContext";
import { AnnotationCanvas } from "../../core/canvas/AnnotationCanvas";
import { DocumentViewer } from "../../core/document-viewer/DocumentViewer";
import { CanvasTool } from "../../core/types/canvas";
import { FieldPanel } from "../../core/field-panel/FieldPanel";
import { useFieldSchema } from "../hooks/useFieldSchema";
import { useLabels, type LabelDto } from "../hooks/useLabels";
import { useProjectDocument } from "../hooks/useProjects";
import type { BoundingBox } from "../../core/types/canvas";

interface LabelingWorkspacePageProps {
  projectId: string;
  documentId: string;
  onBack: () => void;
}

interface LabelState {
  field_key: string;
  label_name: string;
  value?: string;
  page_number: number;
  bounding_box?: {
    polygon: number[];
    pageWidth?: number;
    pageHeight?: number;
  };
  confidence?: number;
  is_manual?: boolean;
}

export const LabelingWorkspacePage: FC<LabelingWorkspacePageProps> = ({
  projectId,
  documentId,
  onBack,
}) => {
  const { schema } = useFieldSchema(projectId);
  const { document: projectDocument, isLoading } = useProjectDocument(
    projectId,
    documentId,
  );
  const { labels, isLoading: isLabelsLoading, saveLabelsAsync, isSaving } =
    useLabels(projectId, documentId);
  const { getAccessToken } = useAuth();
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [labelState, setLabelState] = useState<Record<string, LabelState>>({});
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>(
    { width: 1000, height: 1400 },
  );
  const { ref: canvasRef, width: canvasWidth, height: canvasHeight } =
    useElementSize();

  useEffect(() => {
    const mapped: Record<string, LabelState> = {};
    (labels || []).forEach((label) => {
      const normalized: LabelState = {
        field_key: label.field_key ?? (label as any).field_key,
        label_name: label.label_name ?? (label as any).label_name,
        value: label.value,
        page_number: label.page_number ?? (label as any).page_number ?? 1,
        bounding_box: label.bounding_box ?? (label as any).bounding_box,
        confidence: label.confidence,
        is_manual: label.is_manual,
      };
      mapped[normalized.field_key] = normalized;
    });
    setLabelState(mapped);
  }, [labels]);

  useEffect(() => {
    const loadDocument = async () => {
      if (!projectDocument?.document) return;
      try {
        const token = getAccessToken?.() ?? null;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(
          `/api/documents/${projectDocument.document.id}/download`,
          { headers },
        );
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setDocumentUrl(url);
      } catch (error) {
        console.error("Failed to load document", error);
      }
    };

    void loadDocument();
  }, [projectDocument?.document, getAccessToken]);

  useEffect(() => {
    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [documentUrl]);

  useEffect(() => {
    if (!documentUrl) return;
    const img = new window.Image();
    img.src = documentUrl;
    img.onload = () =>
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, [documentUrl]);

  const labelValues = useMemo(() => {
    const values: Record<string, { value?: string; confidence?: number }> = {};
    Object.values(labelState).forEach((label) => {
      values[label.field_key] = {
        value: label.value,
        confidence: label.confidence,
      };
    });
    return values;
  }, [labelState]);

  const boxes = useMemo(() => {
    return Object.values(labelState)
      .filter((label) => label.bounding_box?.polygon?.length)
      .map((label) => {
        const polygon = label.bounding_box?.polygon || [];
        const points = [];
        for (let i = 0; i < polygon.length; i += 2) {
          points.push({ x: polygon[i], y: polygon[i + 1] });
        }
        const box: BoundingBox = { polygon: points };
        return {
          id: label.field_key,
          box,
          label: label.field_key,
          color: "#228be6",
          confidence: label.confidence,
        };
      });
  }, [labelState]);

  const handleBoxCreate = (box: BoundingBox) => {
    if (!activeFieldKey) return;
    const polygon = box.polygon.flatMap((point) => [point.x, point.y]);
    setLabelState((prev) => ({
      ...prev,
      [activeFieldKey]: {
        field_key: activeFieldKey,
        label_name: activeFieldKey,
        value: prev[activeFieldKey]?.value,
        page_number: 1,
        bounding_box: {
          polygon,
          pageWidth: imageSize.width,
          pageHeight: imageSize.height,
        },
        confidence: prev[activeFieldKey]?.confidence,
        is_manual: true,
      },
    }));
  };

  const handleValueChange = (fieldKey: string, value: string) => {
    setLabelState((prev) => ({
      ...prev,
      [fieldKey]: {
        field_key: fieldKey,
        label_name: fieldKey,
        value,
        page_number: prev[fieldKey]?.page_number ?? 1,
        bounding_box: prev[fieldKey]?.bounding_box,
        confidence: prev[fieldKey]?.confidence,
        is_manual: true,
      },
    }));
  };

  const handleSave = async () => {
    const payload = Object.values(labelState)
      .filter((label) => label.bounding_box?.polygon?.length)
      .map((label) => ({
        field_key: label.field_key,
        label_name: label.label_name,
        value: label.value,
        page_number: label.page_number,
        bounding_box: label.bounding_box!,
        confidence: label.confidence,
        is_manual: label.is_manual,
      })) as LabelDto[];
    await saveLabelsAsync(payload);
  };

  if (isLoading || isLabelsLoading) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Loader size="lg" />
      </Stack>
    );
  }

  if (!projectDocument?.document) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Text size="sm" c="dimmed">
          Document not found.
        </Text>
      </Stack>
    );
  }

  const documentName = projectDocument?.document?.original_filename || "Document";
  const isPdf = projectDocument?.document?.file_type === "pdf";

  return (
    <Stack gap="lg" style={{ height: "100%" }}>
      <Group justify="space-between">
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={onBack}
          >
            Back
          </Button>
          <Stack gap={2}>
            <Title order={2}>{documentName}</Title>
            <Text size="sm" c="dimmed">
              Label fields and draw bounding boxes
            </Text>
          </Stack>
        </Group>
        <Group>
          <Button
            variant="light"
            leftSection={<IconPencil size={16} />}
            onClick={() => setActiveFieldKey(null)}
          >
            Select field
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            loading={isSaving}
          >
            Save labels
          </Button>
        </Group>
      </Group>

      <Group align="stretch" gap="lg" style={{ flex: 1 }}>
        <Paper withBorder style={{ width: 320, minHeight: 0 }}>
          <FieldPanel
            fields={schema}
            values={labelValues}
            activeFieldKey={activeFieldKey}
            onSelectField={setActiveFieldKey}
            onValueChange={handleValueChange}
          />
        </Paper>

        <Paper withBorder style={{ flex: 1, minHeight: 0 }}>
          {!documentUrl ? (
            <Stack align="center" justify="center" h="100%">
              <Text size="sm" c="dimmed">
                Document preview is unavailable.
              </Text>
            </Stack>
          ) : isPdf ? (
            <DocumentViewer documentUrl={documentUrl} />
          ) : (
            <div
              ref={canvasRef}
              style={{ width: "100%", height: "100%", overflow: "auto" }}
            >
              <AnnotationCanvas
                imageUrl={documentUrl}
                width={canvasWidth || imageSize.width}
                height={canvasHeight || imageSize.height}
                boxes={boxes}
                activeTool={activeFieldKey ? CanvasTool.DRAW_BOX : CanvasTool.SELECT}
                onBoxCreate={handleBoxCreate}
              />
            </div>
          )}
        </Paper>
      </Group>
    </Stack>
  );
};
