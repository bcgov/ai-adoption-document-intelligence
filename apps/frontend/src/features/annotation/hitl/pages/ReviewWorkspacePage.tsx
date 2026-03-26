import {
  Accordion,
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
import { useElementSize } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconRotate } from "@tabler/icons-react";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { colorForFieldKeyWithBorder } from "@/shared/utils";
import { AnnotationCanvas } from "../../core/canvas/AnnotationCanvas";
import { DocumentViewer } from "../../core/document-viewer/DocumentViewer";
import { FieldFilterInput } from "../../core/field-panel/FieldFilterInput";
import { KeyboardManager } from "../../core/keyboard/KeyboardManager";
import type { ShortcutDefinition } from "../../core/keyboard/useKeyboardShortcuts";
import { CorrectionAction } from "../../core/types/annotation";
import type { BoundingBox } from "../../core/types/canvas";
import { CanvasTool } from "../../core/types/canvas";
import { ConfidenceIndicator } from "../components/ConfidenceIndicator";
import { CorrectionHistory } from "../components/CorrectionHistory";
import { ReviewToolbar } from "../components/ReviewToolbar";
import { ShortcutsOverlay } from "../components/ShortcutsOverlay";
import { SnippetView } from "../components/SnippetView";
import { useAutoAdvance } from "../hooks/useAutoAdvance";
import { useFieldFocus } from "../hooks/useFieldFocus";
import { useReviewSession } from "../hooks/useReviewSession";
import { useSessionHeartbeat } from "../hooks/useSessionHeartbeat";
import { useUndoRedo } from "../hooks/useUndoRedo";

interface OcrField {
  valueString?: string;
  valueNumber?: number;
  valueDate?: string;
  content?: string;
  confidence?: number;
  boundingRegions?: Array<{
    polygon: number[];
  }>;
  [key: string]: unknown;
}

interface ReviewField {
  fieldKey: string;
  value: string;
  confidence?: number;
  boundingBox?: BoundingBox;
}

interface EnrichmentChange {
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
  reason: string;
  source: "rule" | "llm";
}

interface EnrichmentSummary {
  summary: string;
  changes: EnrichmentChange[];
  rulesApplied: string[];
  llmEnriched: boolean;
  llmModel?: string;
  timestamp: string;
}

const EnrichmentSummaryPanel: FC<{
  summary: EnrichmentSummary;
  mb?: string;
}> = ({ summary, mb = "sm" }) => (
  <Accordion mb={mb} variant="contained">
    <Accordion.Item value="enrichment">
      <Accordion.Control>
        <Text size="sm" fw={600}>
          Enrichment summary
          {summary.llmEnriched && summary.llmModel && (
            <Text component="span" size="xs" c="dimmed" ml="xs">
              (LLM: {summary.llmModel})
            </Text>
          )}
        </Text>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="xs">
          {summary.summary && <Text size="sm">{summary.summary}</Text>}
          {summary.rulesApplied?.length > 0 && (
            <Text size="xs" c="dimmed">
              Rules: {summary.rulesApplied.join(", ")}
            </Text>
          )}
          {summary.changes?.length > 0 && (
            <Stack gap={4}>
              <Text size="xs" fw={600}>
                Changes
              </Text>
              {summary.changes.map((c, i) => (
                <Paper key={i} withBorder p="xs" radius="sm">
                  <Stack gap={2}>
                    <Text size="xs" fw={500}>
                      {c.fieldKey}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {c.originalValue} → {c.correctedValue}
                    </Text>
                    <Text size="xs" c="dimmed" fs="italic">
                      {c.reason}
                      {c.source === "llm" ? " (LLM)" : " (rule)"}
                    </Text>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  </Accordion>
);

export const ReviewWorkspacePage: FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const readOnly = new URLSearchParams(location.search).get("readOnly") === "true";

  const navigateToQueue = () => {
    const benchmarkMatch = location.pathname.match(
      /^\/benchmarking\/datasets\/([^/]+)\/versions\/([^/]+)\/review/,
    );
    if (benchmarkMatch) {
      navigate(
        `/benchmarking/datasets/${benchmarkMatch[1]}/versions/${benchmarkMatch[2]}/review`,
      );
    } else {
      navigate("/review");
    }
  };
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
    reopenSessionAsync,
  } = useReviewSession(sessionId);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isDocumentLoading, setIsDocumentLoading] = useState(true);
  const {
    ref: canvasRef,
    width: canvasWidth,
    height: canvasHeight,
  } = useElementSize();
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
  const [fieldFilter, setFieldFilter] = useState("");
  const [viewMode, setViewMode] = useState<"document" | "snippet">("document");
  const [sortMode, setSortMode] = useState<"confidence" | "document-order">(
    "confidence",
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const documentImageRef = useRef<HTMLImageElement | null>(null);
  const fieldPanelRef = useRef<HTMLDivElement | null>(null);
  const isPdf = session?.document?.storage_path?.endsWith(".pdf");

  const queuePath = location.pathname.match(
    /^\/benchmarking\/datasets\/([^/]+)\/versions\/([^/]+)\/review/,
  )
    ? location.pathname.replace(/\/[^/]+$/, "")
    : "/review";

  useSessionHeartbeat(sessionId, queuePath);

  const {
    pushUndo,
    undo,
    redo,
    canUndo,
    pendingReopen,
    setPendingSessionReopen,
    undoSessionAction,
    clear: clearUndoStack,
  } = useUndoRedo(sessionId);

  const { advance } = useAutoAdvance();

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    const loadDocument = async () => {
      if (!session?.document?.id) {
        setIsDocumentLoading(false);
        return;
      }
      setIsDocumentLoading(true);
      try {
        const response = await fetch(
          `/api/documents/${session.document.id}/download`,
          { credentials: "include" },
        );
        if (!response.ok || revoked) {
          if (!revoked) setIsDocumentLoading(false);
          return;
        }
        const blob = await response.blob();
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        setDocumentUrl(url);
        setIsDocumentLoading(false);

        const img = new Image();
        img.src = url;
        img.onload = () => {
          if (!revoked) {
            documentImageRef.current = img;
          }
        };
      } catch {
        if (!revoked) setIsDocumentLoading(false);
      }
    };

    void loadDocument();

    return () => {
      revoked = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [session?.document?.id]);

  const fields = useMemo<ReviewField[]>(() => {
    const ocrFields = session?.document?.ocr_result?.fields;
    if (!ocrFields || typeof ocrFields !== "object") {
      return [];
    }

    const result = Object.entries(ocrFields).map(
      ([fieldKey, field]: [string, OcrField]) => {
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
      },
    );

    return result;
  }, [session?.document?.ocr_result]);

  const enrichmentCorrectedValues = useMemo(() => {
    const summary = session?.document?.ocr_result?.enrichment_summary as
      | EnrichmentSummary
      | undefined;
    if (!summary?.changes?.length) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of summary.changes) {
      map.set(c.fieldKey, c.correctedValue);
    }
    return map;
  }, [session?.document?.ocr_result?.enrichment_summary]);

  const { canvasRef: fieldFocusCanvasRef, focusField } = useFieldFocus(fields);

  const sortedFields = useMemo(() => {
    if (sortMode === "confidence") {
      return [...fields].sort(
        (a, b) => (a.confidence ?? 1) - (b.confidence ?? 1),
      );
    }
    return fields;
  }, [fields, sortMode]);

  const filteredSortedFields = useMemo(() => {
    if (!fieldFilter) return sortedFields;
    const lower = fieldFilter.toLowerCase();
    return sortedFields.filter((f) => f.fieldKey.toLowerCase().includes(lower));
  }, [sortedFields, fieldFilter]);

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
    const previousValue =
      correctionMap[field.fieldKey]?.corrected_value ??
      enrichmentCorrectedValues.get(field.fieldKey) ??
      field.value;

    pushUndo({
      type: "field-edit",
      fieldKey: field.fieldKey,
      previousValue,
    });

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

  const handleReopen = async () => {
    if (!sessionId) return;
    setIsReopening(true);
    try {
      await reopenSessionAsync(sessionId);
      // Remove readOnly param to switch into edit mode
      const params = new URLSearchParams(location.search);
      params.delete("readOnly");
      const newSearch = params.toString();
      navigate(
        `${location.pathname}${newSearch ? `?${newSearch}` : ""}`,
        { replace: true },
      );
    } catch {
      notifications.show({
        title: "Cannot reopen",
        message:
          "The reopen window may have expired or the dataset is frozen",
        color: "red",
        autoClose: 5000,
      });
    } finally {
      setIsReopening(false);
    }
  };

  const handleApprove = async () => {
    const payload = Object.values(correctionMap).filter(
      (correction) => correction.action === CorrectionAction.CORRECTED,
    );
    if (payload.length > 0) {
      await submitCorrectionsAsync(payload);
    }
    await approveSessionAsync();

    if (sessionId) {
      setPendingSessionReopen(sessionId, "approved", 5 * 60 * 1000);
      notifications.show({
        title: "Document approved",
        message: "Press Ctrl+Z to undo",
        color: "green",
        autoClose: 5000,
      });
    }

    clearUndoStack();
    setCorrectionMap({});
    advance();
  };

  const handleSkip = async () => {
    await skipSessionAsync();

    if (sessionId) {
      setPendingSessionReopen(sessionId, "skipped", 5 * 60 * 1000);
      notifications.show({
        title: "Document skipped",
        message: "Press Ctrl+Z to undo",
        color: "gray",
        autoClose: 3000,
      });
    }

    clearUndoStack();
    setCorrectionMap({});
    advance();
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) return;
    await escalateSessionAsync(escalationReason.trim());
    setEscalationOpen(false);
    setEscalationReason("");

    if (sessionId) {
      setPendingSessionReopen(sessionId, "escalated", 5 * 60 * 1000);
      notifications.show({
        title: "Document escalated",
        message: "Press Ctrl+Z to undo",
        color: "yellow",
        autoClose: 3000,
      });
    }

    clearUndoStack();
    setCorrectionMap({});
    advance();
  };

  const navigateToField = useCallback(
    (direction: "next" | "prev") => {
      const currentIndex = filteredSortedFields.findIndex(
        (f) => f.fieldKey === activeFieldKey,
      );
      let nextIndex: number;
      if (direction === "next") {
        nextIndex =
          currentIndex < filteredSortedFields.length - 1
            ? currentIndex + 1
            : 0;
      } else {
        nextIndex =
          currentIndex > 0
            ? currentIndex - 1
            : filteredSortedFields.length - 1;
      }
      const nextField = filteredSortedFields[nextIndex];
      if (nextField) {
        setActiveFieldKey(nextField.fieldKey);
        if (viewMode === "document") {
          focusField(nextField.fieldKey);
        }
        // Focus the input element after React re-renders
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>(
            `input[data-field-key="${nextField.fieldKey}"]`,
          );
          input?.focus();
        });
      }
    },
    [filteredSortedFields, activeFieldKey, viewMode, focusField],
  );

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const entry = undo();
      if (entry) {
        // Focus on the field being undone
        setActiveFieldKey(entry.fieldKey);
        if (viewMode === "document") {
          focusField(entry.fieldKey);
        }

        const originalField = fields.find(
          (f) => f.fieldKey === entry.fieldKey,
        );
        const originalValue =
          enrichmentCorrectedValues.get(entry.fieldKey) ?? originalField?.value;
        setCorrectionMap((prev) => {
          const next = { ...prev };
          if (entry.previousValue === originalValue) {
            delete next[entry.fieldKey];
          } else {
            next[entry.fieldKey] = {
              field_key: entry.fieldKey,
              original_value: originalField?.value ?? "",
              corrected_value: entry.previousValue,
              original_conf: originalField?.confidence,
              action: CorrectionAction.CORRECTED,
            };
          }
          return next;
        });
      }
    } else if (pendingReopen) {
      undoSessionAction();
    }
  }, [
    canUndo,
    undo,
    pendingReopen,
    undoSessionAction,
    fields,
    enrichmentCorrectedValues,
    viewMode,
    focusField,
  ]);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (entry) {
      const originalField = fields.find(
        (f) => f.fieldKey === entry.fieldKey,
      );
      setCorrectionMap((prev) => ({
        ...prev,
        [entry.fieldKey]: {
          field_key: entry.fieldKey,
          original_value: originalField?.value ?? "",
          corrected_value: entry.previousValue,
          original_conf: originalField?.confidence,
          action: CorrectionAction.CORRECTED,
        },
      }));
    }
  }, [redo, fields]);

  const shortcuts: ShortcutDefinition[] = useMemo(
    () => [
      {
        key: "ArrowDown",
        ctrl: true,
        handler: () => navigateToField("next"),
        description: "Next field",
      },
      {
        key: "ArrowUp",
        ctrl: true,
        handler: () => navigateToField("prev"),
        description: "Previous field",
      },
      {
        key: "Tab",
        handler: () => navigateToField("next"),
        description: "Next field (from edit)",
        alwaysActive: true,
      },
      {
        key: "Tab",
        shift: true,
        handler: () => navigateToField("prev"),
        description: "Previous field (from edit)",
        alwaysActive: true,
      },
      {
        key: "Enter",
        ctrl: true,
        handler: handleApprove,
        description: "Approve document",
        alwaysActive: true,
      },
      {
        key: "E",
        ctrl: true,
        shift: true,
        handler: () => setEscalationOpen(true),
        description: "Escalate document",
        alwaysActive: true,
      },
      {
        key: "S",
        ctrl: true,
        shift: true,
        handler: handleSkip,
        description: "Skip document",
        alwaysActive: true,
      },
      {
        key: "z",
        ctrl: true,
        handler: handleUndo,
        description: "Undo",
        alwaysActive: true,
      },
      {
        key: "z",
        ctrl: true,
        shift: true,
        handler: handleRedo,
        description: "Redo",
        alwaysActive: true,
      },
      {
        key: "Escape",
        handler: () => setActiveFieldKey(null),
        description: "Deselect field",
        alwaysActive: true,
      },
      {
        key: "V",
        ctrl: true,
        shift: true,
        handler: () =>
          setViewMode((m) => (m === "document" ? "snippet" : "document")),
        description: "Toggle view mode",
        alwaysActive: true,
      },
      {
        key: "O",
        ctrl: true,
        shift: true,
        handler: () =>
          setSortMode((m) =>
            m === "confidence" ? "document-order" : "confidence",
          ),
        description: "Toggle sort order",
        alwaysActive: true,
      },
      {
        key: "/",
        ctrl: true,
        handler: () => setShortcutsOpen((o) => !o),
        description: "Keyboard shortcuts",
        alwaysActive: true,
      },
    ],
    [navigateToField, handleApprove, handleSkip, handleUndo, handleRedo],
  );

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
    <KeyboardManager shortcuts={shortcuts}>
      <Stack
        gap="md"
        style={{ flex: 1, height: "100%", minHeight: 0, overflow: "hidden" }}
      >
        <Group justify="space-between">
          <Group>
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={navigateToQueue}
            >
              Back
            </Button>
            <Stack gap={2}>
              <Title order={2}>
                {readOnly ? "View Session" : "Review Session"}
              </Title>
              <Text size="sm" c="dimmed">
                {session?.document?.original_filename || "Document review"}
              </Text>
            </Stack>
          </Group>
          {readOnly && (
            <Button
              variant="light"
              color="blue"
              leftSection={<IconRotate size={16} />}
              onClick={handleReopen}
              loading={isReopening}
            >
              Reopen for Editing
            </Button>
          )}
        </Group>

        {!readOnly && (
          <ReviewToolbar
            onApprove={handleApprove}
            onEscalate={() => setEscalationOpen(true)}
            onSkip={handleSkip}
            isApproving={isApproving}
            isEscalating={isEscalating}
            isSkipping={isSkipping}
            viewMode={viewMode}
            onViewModeToggle={() =>
              setViewMode((m) => (m === "document" ? "snippet" : "document"))
            }
            sortMode={sortMode}
            onSortModeToggle={() =>
              setSortMode((m) =>
                m === "confidence" ? "document-order" : "confidence",
              )
            }
          />
        )}

        {viewMode === "snippet" ? (
          <SnippetView
            fields={filteredSortedFields.map((f) => {
              const ocrField = (
                session?.document?.ocr_result?.fields as
                  | Record<string, OcrField>
                  | undefined
              )?.[f.fieldKey];
              return {
                fieldKey: f.fieldKey,
                value: f.value,
                confidence: f.confidence,
                boundingRegions: ocrField?.boundingRegions,
              };
            })}
            documentImage={documentImageRef.current}
            activeFieldKey={activeFieldKey}
            onFieldSelect={(key) => setActiveFieldKey(key)}
            onFieldChange={(key, value) => {
              const field = fields.find((fl) => fl.fieldKey === key);
              if (field) handleFieldChange(field, value);
            }}
            correctionMap={correctionMap}
            readOnly={readOnly}
          />
        ) : (
          <Group
            align="stretch"
            gap="md"
            style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            wrap="nowrap"
          >
            <Paper
              withBorder
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {isPdf ? (
                !documentUrl ? (
                  <Stack
                    align="center"
                    justify="center"
                    style={{ position: "absolute", inset: 0 }}
                  >
                    {isDocumentLoading ? (
                      <Loader size="md" />
                    ) : (
                      <Text size="sm" c="dimmed">
                        Document preview is unavailable.
                      </Text>
                    )}
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
                      {isDocumentLoading ? (
                        <Loader size="md" />
                      ) : (
                        <Text size="sm" c="dimmed">
                          Document preview is unavailable.
                        </Text>
                      )}
                    </Stack>
                  ) : (
                    canvasWidth > 0 &&
                    canvasHeight > 0 && (
                      <AnnotationCanvas
                        ref={fieldFocusCanvasRef}
                        imageUrl={documentUrl}
                        width={canvasWidth}
                        height={canvasHeight}
                        boxes={boxes}
                        activeTool={CanvasTool.SELECT}
                        onBoxSelect={(boxId) => {
                          setActiveFieldKey(boxId);
                          if (boxId) {
                            focusField(boxId);
                          }
                        }}
                      />
                    )
                  )}
                </div>
              )}
            </Paper>

            <Paper
              ref={fieldPanelRef}
              withBorder
              p="sm"
              style={{
                width: 360,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
              onClick={(e) => {
                // Deselect when clicking on panel background
                if (e.target === e.currentTarget) {
                  setActiveFieldKey(null);
                }
              }}
            >
              {session?.document?.ocr_result?.enrichment_summary != null && (
                <EnrichmentSummaryPanel
                  summary={
                    session.document.ocr_result
                      .enrichment_summary as EnrichmentSummary
                  }
                  mb="sm"
                />
              )}
              <Text
                size="sm"
                fw={600}
                mb="sm"
                onClick={() => setActiveFieldKey(null)}
                style={{ cursor: "pointer" }}
              >
                Fields
              </Text>

              <FieldFilterInput
                value={fieldFilter}
                onChange={setFieldFilter}
                totalCount={sortedFields.length}
                filteredCount={filteredSortedFields.length}
              />

              <ScrollArea
                type="auto"
                style={{ flex: 1, minHeight: 0 }}
                offsetScrollbars="present"
                viewportProps={{
                  style: { paddingRight: 16 },
                  onClick: (e: React.MouseEvent) => {
                    if (
                      e.target === e.currentTarget ||
                      (e.target as HTMLElement).classList.contains(
                        "mantine-ScrollArea-viewport",
                      )
                    ) {
                      setActiveFieldKey(null);
                    }
                  },
                }}
              >
                <Stack gap="md">
                  {filteredSortedFields.map((field) => {
                    const correction = correctionMap[field.fieldKey];
                    const isCorrected =
                      correction?.action === CorrectionAction.CORRECTED;
                    const isActive = field.fieldKey === activeFieldKey;

                    // Generate deterministic color based on field key
                    const { borderCss } = colorForFieldKeyWithBorder(
                      field.fieldKey,
                    );

                    return (
                      <Paper
                        key={field.fieldKey}
                        withBorder
                        p="sm"
                        style={{
                          borderColor: isActive ? "#ff0000" : borderCss,
                          borderStyle: isActive ? "dashed" : "solid",
                          borderWidth: isActive
                            ? "3px"
                            : isCorrected
                              ? "2px"
                              : "2px",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setActiveFieldKey(field.fieldKey);
                          focusField(field.fieldKey);
                        }}
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
                            <ConfidenceIndicator
                              confidence={field.confidence}
                            />
                          </Group>
                          <TextInput
                            data-field-key={field.fieldKey}
                            value={
                              correctionMap[field.fieldKey]?.corrected_value ??
                              enrichmentCorrectedValues.get(field.fieldKey) ??
                              field.value
                            }
                            onChange={(event) =>
                              handleFieldChange(
                                field,
                                event.currentTarget.value,
                              )
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
        )}

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
              onChange={(event) =>
                setEscalationReason(event.currentTarget.value)
              }
            />
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => setEscalationOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleEscalate}>Escalate</Button>
            </Group>
          </Stack>
        </Modal>

        <ShortcutsOverlay
          opened={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
          shortcuts={shortcuts}
        />
      </Stack>
    </KeyboardManager>
  );
};
