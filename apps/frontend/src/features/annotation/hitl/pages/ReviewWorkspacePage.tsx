import { FC, useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import { useAuth } from "@/auth/AuthContext";
import { colorForFieldKeyWithBorder } from "@/shared/utils";
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
  readOnly?: boolean;
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
  readOnly = false,
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
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const isPdf = session?.document?.storage_path?.endsWith(".pdf");

  useEffect(() => {
    const loadDocument = async () => {
      if (!session?.document?.id) {
        return;
      }
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
      .map((field) => {
        // Generate deterministic color based on field key
        const { borderCss } = colorForFieldKeyWithBorder(field.fieldKey);
        const isActive = field.fieldKey === activeFieldKey;

        return {
          id: field.fieldKey,
          box: field.boundingBox!,
          label: field.fieldKey,
          color: borderCss,
          confidence: field.confidence,
          isActive,
        };
      });
    return result;
  }, [sortedFields, activeFieldKey]);

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

  const handleApprove = async () => {
    const payload = Object.values(correctionMap).filter(
      correction => correction.action === CorrectionAction.CORRECTED
    );
    if (payload.length > 0) {
      await submitCorrectionsAsync(payload);
    }
    await approveSessionAsync();
    onBack();
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

  return (
    <Stack gap="md" style={{ flex: 1, height: "100%", minHeight: 0, overflow: "hidden" }}>
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
            <Title order={2}>{readOnly ? "View Session" : "Review Session"}</Title>
            <Text size="sm" c="dimmed">
              {session?.document?.original_filename || "Document review"}
            </Text>
          </Stack>
        </Group>
      </Group>

      {!readOnly && (
        <ReviewToolbar
          onApprove={handleApprove}
          onEscalate={() => setEscalationOpen(true)}
          onSkip={() => skipSessionAsync()}
          isApproving={isApproving}
          isEscalating={isEscalating}
          isSkipping={isSkipping}
        />
      )}

      <Group align="stretch" gap="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }} wrap="nowrap">
        <Paper withBorder style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", overflow: "hidden" }}>
          {isPdf ? (
            !documentUrl ? (
              <Stack
                align="center"
                justify="center"
                style={{ position: "absolute", inset: 0 }}
              >
                <Text size="sm" c="dimmed">
                  Document preview is unavailable.
                </Text>
              </Stack>
            ) : (
              <div
                style={{ position: "absolute", inset: 0 }}
                onClick={(e) => {
                  // Deselect when clicking on PDF background
                  if (e.target === e.currentTarget) {
                    setActiveFieldKey(null);
                  }
                }}
              >
                <DocumentViewer documentUrl={documentUrl} fitToContainer />
              </div>
            )
          ) : (
            <div
              ref={canvasRef}
              style={{ position: "absolute", inset: 0, overflow: "hidden" }}
            >
              {!documentUrl ? (
                <Stack
                  align="center"
                  justify="center"
                  style={{ position: "absolute", inset: 0 }}
                >
                  <Text size="sm" c="dimmed">
                    Document preview is unavailable.
                  </Text>
                </Stack>
              ) : (
                canvasWidth > 0 &&
                canvasHeight > 0 && (
                  <AnnotationCanvas
                    imageUrl={documentUrl}
                    width={canvasWidth}
                    height={canvasHeight}
                    boxes={boxes}
                    activeTool={CanvasTool.SELECT}
                    onBoxSelect={(boxId) => setActiveFieldKey(boxId)}
                  />
                )
              )}
            </div>
          )}
        </Paper>

        <Paper
          withBorder
          p="sm"
          style={{
            width: 360,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => {
            // Deselect when clicking on panel background
            if (e.target === e.currentTarget) {
              setActiveFieldKey(null);
            }
          }}
        >
          <Text
            size="sm"
            fw={600}
            mb="sm"
            onClick={() => setActiveFieldKey(null)}
            style={{ cursor: 'pointer' }}
          >
            Fields
          </Text>

          <ScrollArea
            type="auto"
            style={{ flex: 1, minHeight: 0 }}
            offsetScrollbars="present"
            viewportProps={{
              style: { paddingRight: 16 },
              onClick: (e: React.MouseEvent) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('mantine-ScrollArea-viewport')) {
                  setActiveFieldKey(null);
                }
              }
            }}
          >
            <Stack gap="md">
              {sortedFields.map((field) => {
                const correction = correctionMap[field.fieldKey];
                const isCorrected = correction?.action === CorrectionAction.CORRECTED;
                const isActive = field.fieldKey === activeFieldKey;

                // Generate deterministic color based on field key
                const { borderCss } = colorForFieldKeyWithBorder(field.fieldKey);

                return (
                  <Paper
                    key={field.fieldKey}
                    withBorder
                    p="sm"
                    style={{
                      borderColor: isActive ? '#ff0000' : borderCss,
                      borderStyle: isActive ? 'dashed' : 'solid',
                      borderWidth: isActive ? '3px' : (isCorrected ? '2px' : '2px'),
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveFieldKey(field.fieldKey)}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Group gap="xs">
                          <Text fw={600} size="sm">
                            {field.fieldKey}
                          </Text>
                          {isCorrected && (
                            <Text size="xs" c="yellow" fw={500}>
                              ✎ Edited
                            </Text>
                          )}
                        </Group>
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
                        disabled={readOnly}
                      />
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
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
