import { FC, useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconCheck } from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import { useAuth } from "@/auth/AuthContext";
import { AnnotationCanvas } from "../../core/canvas/AnnotationCanvas";
import { DocumentViewer } from "../../core/document-viewer/DocumentViewer";
import { CanvasTool } from "../../core/types/canvas";
import { ConfidenceIndicator } from "../components/ConfidenceIndicator";
import { ReviewToolbar } from "../components/ReviewToolbar";
import { CorrectionHistory } from "../components/CorrectionHistory";
import { useReviewSession } from "../hooks/useReviewSession";
import { CorrectionAction } from "../../core/types/annotation";
import type { BoundingBox } from "../../core/types/canvas";

interface ReviewWorkspacePageProps {
  sessionId: string;
  onBack: () => void;
}

interface ReviewField {
  fieldKey: string;
  value: string;
  confidence?: number;
  boundingBox?: BoundingBox;
}

export const ReviewWorkspacePage: FC<ReviewWorkspacePageProps> = ({
  sessionId,
  onBack,
}) => {
  const {
    session,
    corrections,
    isLoading,
    submitCorrectionsAsync,
    approveSessionAsync,
    escalateSessionAsync,
    skipSessionAsync,
    isApproving,
    isEscalating,
    isSkipping,
  } = useReviewSession(sessionId);
  const { getAccessToken } = useAuth();
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>(
    { width: 1000, height: 1400 },
  );
  const { ref: canvasRef, width: canvasWidth, height: canvasHeight } =
    useElementSize();
  const [correctionMap, setCorrectionMap] = useState<
    Record<
      string,
      {
        field_key: string;
        original_value?: string;
        corrected_value?: string;
        original_conf?: number;
        action: CorrectionAction;
      }
    >
  >({});
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");

  useEffect(() => {
    const loadDocument = async () => {
      if (!session?.document?.id) return;
      try {
        const token = getAccessToken?.() ?? null;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(
          `/api/documents/${session.document.id}/download`,
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
  }, [session?.document?.id, getAccessToken]);

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
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }, [documentUrl]);

  const fields = useMemo<ReviewField[]>(() => {
    const ocrFields = session?.document?.ocr_result?.fields;
    if (!ocrFields || typeof ocrFields !== "object") {
      return [];
    }

    const result = Object.entries(ocrFields).map(([fieldKey, field]: any) => {
      const value =
        field.valueString ??
        field.valueNumber?.toString() ??
        field.valueDate ??
        field.content ??
        "";
      const boundingRegion = field.boundingRegions?.[0];
      const polygon = boundingRegion?.polygon || [];
      const points = [];
      for (let i = 0; i < polygon.length; i += 2) {
        points.push({ x: polygon[i], y: polygon[i + 1] });
      }
      const boundingBox = points.length ? { polygon: points } : undefined;

      return {
        fieldKey,
        value,
        confidence: field.confidence,
        boundingBox,
      };
    });

    return result;
  }, [session?.document?.ocr_result]);

  const sortedFields = useMemo(
    () =>
      [...fields].sort(
        (a, b) => (a.confidence ?? 1) - (b.confidence ?? 1),
      ),
    [fields],
  );

  const boxes = useMemo(() => {
    const result = sortedFields
      .filter((field) => field.boundingBox)
      .map((field) => ({
        id: field.fieldKey,
        box: field.boundingBox!,
        label: field.fieldKey,
        color: "#fab005",
        confidence: field.confidence,
      }));
    return result;
  }, [sortedFields]);

  const handleFieldChange = (field: ReviewField, value: string) => {
    setCorrectionMap((prev) => ({
      ...prev,
      [field.fieldKey]: {
        field_key: field.fieldKey,
        original_value: field.value,
        corrected_value: value,
        original_conf: field.confidence,
        action: CorrectionAction.CORRECTED,
      },
    }));
  };

  const handleConfirmField = (field: ReviewField) => {
    setCorrectionMap((prev) => ({
      ...prev,
      [field.fieldKey]: {
        field_key: field.fieldKey,
        original_value: field.value,
        corrected_value: field.value,
        original_conf: field.confidence,
        action: CorrectionAction.CONFIRMED,
      },
    }));
  };

  const handleApprove = async () => {
    const payload = Object.values(correctionMap);
    if (payload.length) {
      await submitCorrectionsAsync(payload);
    }
    await approveSessionAsync();
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) return;
    await escalateSessionAsync(escalationReason.trim());
    setEscalationOpen(false);
    setEscalationReason("");
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Loader size="lg" />
      </Stack>
    );
  }

  if (!session) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Text size="sm" c="dimmed">
          Review session not found.
        </Text>
      </Stack>
    );
  }

  const isPdf = session.document?.storage_path?.endsWith(".pdf");

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
            <Title order={2}>Review Session</Title>
            <Text size="sm" c="dimmed">
              {session?.document?.original_filename || "Document review"}
            </Text>
          </Stack>
        </Group>
      </Group>

      <ReviewToolbar
        onApprove={handleApprove}
        onEscalate={() => setEscalationOpen(true)}
        onSkip={() => skipSessionAsync()}
        isApproving={isApproving}
        isEscalating={isEscalating}
        isSkipping={isSkipping}
      />

      <Group align="stretch" gap="lg" style={{ flex: 1 }}>
        <Paper withBorder style={{ width: 360, minHeight: 0 }}>
          <Stack gap="md" p="md">
            <Text fw={600}>Fields</Text>
            {sortedFields.map((field) => (
              <Paper key={field.fieldKey} withBorder p="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={600} size="sm">
                      {field.fieldKey}
                    </Text>
                    <ConfidenceIndicator confidence={field.confidence} />
                  </Group>
                  <TextInput
                    value={
                      correctionMap[field.fieldKey]?.corrected_value ??
                      field.value
                    }
                    onChange={(event) =>
                      handleFieldChange(field, event.currentTarget.value)
                    }
                  />
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconCheck size={14} />}
                    onClick={() => handleConfirmField(field)}
                  >
                    Confirm
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
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
                activeTool={CanvasTool.SELECT}
              />
            </div>
          )}
        </Paper>
      </Group>

      <Stack gap="xs">
        <Text fw={600}>Correction history</Text>
        <CorrectionHistory corrections={corrections} />
      </Stack>

      <Modal
        opened={escalationOpen}
        onClose={() => setEscalationOpen(false)}
        title="Escalate review"
      >
        <Stack gap="md">
          <TextInput
            label="Escalation reason"
            placeholder="Explain why this needs expert review"
            value={escalationReason}
            onChange={(event) => setEscalationReason(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setEscalationOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEscalate}>Escalate</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
