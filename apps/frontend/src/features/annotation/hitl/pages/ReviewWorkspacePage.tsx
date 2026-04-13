import {
  Accordion,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconRotate } from "@tabler/icons-react";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { colorForFieldKeyWithBorder } from "@/shared/utils";
import { useCanvasZoom } from "../../core/canvas/hooks/useCanvasZoom";
import { ViewerToolbar } from "../../core/document-viewer/ViewerToolbar";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import { FieldFilterInput } from "../../core/field-panel/FieldFilterInput";
import { KeyboardManager } from "../../core/keyboard/KeyboardManager";
import type { ShortcutDefinition } from "../../core/keyboard/useKeyboardShortcuts";
import { CorrectionAction } from "../../core/types/annotation";
import type { BoundingBox } from "../../core/types/canvas";
import { ConfidenceIndicator } from "../components/ConfidenceIndicator";
import { CorrectionHistory } from "../components/CorrectionHistory";
import { ReviewToolbar } from "../components/ReviewToolbar";
import { ShortcutsOverlay } from "../components/ShortcutsOverlay";
import { useAutoAdvance } from "../hooks/useAutoAdvance";
import { useReviewSession } from "../hooks/useReviewSession";
import { useSessionHeartbeat } from "../hooks/useSessionHeartbeat";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { buildFieldValidators } from "../utils/format-validation";

interface OcrField {
  valueString?: string;
  valueNumber?: number;
  valueDate?: string;
  content?: string;
  confidence?: number;
  boundingRegions?: Array<{
    polygon: number[];
    pageNumber?: number;
  }>;
  [key: string]: unknown;
}

interface ReviewField {
  fieldKey: string;
  value: string;
  confidence?: number;
  boundingBox?: BoundingBox;
  /** 1-based page index from OCR (defaults to 1). */
  pageNumber: number;
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
  const readOnly =
    new URLSearchParams(location.search).get("readOnly") === "true";

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
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const { zoom, zoomIn, zoomOut, resetZoom, zoomToFit } = useCanvasZoom();
  const {
    ref: pdfContainerRef,
    width: pdfContainerWidth,
    height: pdfContainerHeight,
  } = useElementSize();
  const [pdfRenderedSize, setPdfRenderedSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pdfOriginalSize, setPdfOriginalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const initialZoomSetRef = useRef(false);
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
  const [sortMode, setSortMode] = useState<"confidence" | "alphabetical">(
    "confidence",
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const fieldPanelRef = useRef<HTMLDivElement | null>(null);

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
    clear: clearUndoStack,
  } = useUndoRedo(sessionId);

  const { advance } = useAutoAdvance();

  useEffect(() => {
    initialZoomSetRef.current = false;
    setCurrentPage(1);
    setPdfRenderedSize(null);
    setPdfOriginalSize(null);
  }, [session?.document?.id]);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    const loadDocument = async () => {
      if (!session?.document?.id) {
        return;
      }
      try {
        const response = await fetch(
          `/api/documents/${session.document.id}/view`,
          { credentials: "include" },
        );
        if (!response.ok || revoked) return;
        const blob = await response.blob();
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        setDocumentUrl(url);
      } catch {
        // Document load failed; leave URL unset
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

  useEffect(() => {
    if (
      !initialZoomSetRef.current &&
      pdfContainerWidth > 0 &&
      pdfContainerHeight > 0 &&
      pdfOriginalSize
    ) {
      zoomToFit(
        pdfContainerWidth,
        pdfContainerHeight,
        pdfOriginalSize.width,
        pdfOriginalSize.height,
      );
      initialZoomSetRef.current = true;
    }
  }, [pdfContainerWidth, pdfContainerHeight, pdfOriginalSize, zoomToFit]);

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
        const pageNumber = boundingRegion?.pageNumber ?? 1;
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
          pageNumber,
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

  const fieldValidators = useMemo(() => {
    if (!session?.fieldDefinitions?.length) return {};
    return buildFieldValidators(session.fieldDefinitions);
  }, [session?.fieldDefinitions]);

  const sortedFields = useMemo(() => {
    if (sortMode === "confidence") {
      return [...fields].sort(
        (a, b) => (a.confidence ?? 1) - (b.confidence ?? 1),
      );
    }
    return [...fields].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  }, [fields, sortMode]);

  const filteredSortedFields = useMemo(() => {
    if (!fieldFilter) return sortedFields;
    const lower = fieldFilter.toLowerCase();
    return sortedFields.filter((f) => f.fieldKey.toLowerCase().includes(lower));
  }, [sortedFields, fieldFilter]);

  const fieldsOnCurrentPage = useMemo(
    () =>
      filteredSortedFields.filter(
        (f) =>
          f.pageNumber === currentPage &&
          f.boundingBox &&
          f.boundingBox.polygon.length >= 2,
      ),
    [filteredSortedFields, currentPage],
  );

  // Focus first field input when a new session loads
  useEffect(() => {
    if (filteredSortedFields.length > 0 && session?.id) {
      const firstField = filteredSortedFields[0];
      setActiveFieldKey(firstField.fieldKey);
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-field-key="${firstField.fieldKey}"]`,
        );
        if (el) {
          if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
            el.focus();
          } else {
            const input = el.querySelector<HTMLInputElement>("input");
            input?.focus();
          }
        }
      });
    }
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll the active field row into view in the field panel when selection
  // changes (e.g. via clicking a bounding box on the canvas).
  useEffect(() => {
    if (!activeFieldKey) return;
    const panel = fieldPanelRef.current;
    if (!panel) return;
    const row = panel.querySelector<HTMLElement>(
      `[data-field-key="${CSS.escape(activeFieldKey)}"]`,
    );
    if (row) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeFieldKey]);

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
      navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ""}`, {
        replace: true,
      });
    } catch {
      notifications.show({
        title: "Cannot reopen",
        message: "The reopen window may have expired or the dataset is frozen",
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

    notifications.show({
      title: "Document approved",
      message: "Moving to next document",
      color: "green",
      autoClose: 3000,
    });

    clearUndoStack();
    setCorrectionMap({});
    advance();
  };

  const handleSkip = async () => {
    await skipSessionAsync();

    notifications.show({
      title: "Document skipped",
      message: "Moving to next document",
      color: "gray",
      autoClose: 3000,
    });

    clearUndoStack();
    setCorrectionMap({});
    advance();
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) return;
    await escalateSessionAsync(escalationReason.trim());
    setEscalationOpen(false);
    setEscalationReason("");

    notifications.show({
      title: "Document escalated",
      message: "Moving to next document",
      color: "yellow",
      autoClose: 3000,
    });

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
          currentIndex < filteredSortedFields.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : filteredSortedFields.length - 1;
      }
      const nextField = filteredSortedFields[nextIndex];
      if (nextField) {
        setActiveFieldKey(nextField.fieldKey);
        // Focus the input/textarea/checkbox after React re-renders
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-field-key="${nextField.fieldKey}"]`,
          );
          if (!el) return;
          if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
            el.focus();
          } else {
            // Checkbox wrapper — find the input inside
            const input = el.querySelector<HTMLInputElement>("input");
            input?.focus();
          }
        });
      }
    },
    [filteredSortedFields, activeFieldKey],
  );

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const entry = undo();
      if (entry) {
        setActiveFieldKey(entry.fieldKey);

        const originalField = fields.find((f) => f.fieldKey === entry.fieldKey);
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
    }
  }, [canUndo, undo, fields, enrichmentCorrectedValues]);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (entry) {
      const originalField = fields.find((f) => f.fieldKey === entry.fieldKey);
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
        key: "O",
        ctrl: true,
        shift: true,
        handler: () =>
          setSortMode((m) =>
            m === "confidence" ? "alphabetical" : "confidence",
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
            sortMode={sortMode}
            onSortModeToggle={() =>
              setSortMode((m) =>
                m === "confidence" ? "alphabetical" : "confidence",
              )
            }
          />
        )}

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
              <Stack
                gap="xs"
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <ViewerToolbar
                  currentPage={currentPage}
                  totalPages={numPages || 1}
                  zoom={zoom}
                  onPageChange={setCurrentPage}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onZoomReset={resetZoom}
                />
                <div
                  ref={pdfContainerRef}
                  style={{
                    position: "relative",
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setActiveFieldKey(null);
                    }
                  }}
                >
                  <div
                    style={{ position: "relative", display: "inline-block" }}
                  >
                    <Document
                      file={documentUrl}
                      onLoadSuccess={({ numPages: n }) => {
                        setNumPages(n);
                      }}
                    >
                      <Page
                        pageNumber={currentPage}
                        scale={zoom}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        onLoadSuccess={(page) => {
                          setPdfRenderedSize({
                            width: page.width,
                            height: page.height,
                          });
                          const originalWidth = page.width / zoom;
                          const originalHeight = page.height / zoom;
                          setPdfOriginalSize({
                            width: originalWidth,
                            height: originalHeight,
                          });
                        }}
                      />
                    </Document>
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: pdfRenderedSize?.width ?? "100%",
                        height: pdfRenderedSize?.height ?? "100%",
                        pointerEvents: "none",
                      }}
                    >
                      {fieldsOnCurrentPage.map((field) => {
                        const poly = field.boundingBox!.polygon;
                        const xs = poly.map((p) => p.x);
                        const ys = poly.map((p) => p.y);
                        const minX = Math.min(...xs);
                        const minY = Math.min(...ys);
                        const maxX = Math.max(...xs);
                        const maxY = Math.max(...ys);
                        const pageW = pdfOriginalSize?.width ?? 1;
                        const pageH = pdfOriginalSize?.height ?? 1;
                        const rw = pdfRenderedSize?.width ?? 1;
                        const rh = pdfRenderedSize?.height ?? 1;
                        const INCH_TO_PT = 72;
                        const left = minX * INCH_TO_PT * (rw / pageW);
                        const top = minY * INCH_TO_PT * (rh / pageH);
                        const width = (maxX - minX) * INCH_TO_PT * (rw / pageW);
                        const height =
                          (maxY - minY) * INCH_TO_PT * (rh / pageH);
                        const { borderCss } = colorForFieldKeyWithBorder(
                          field.fieldKey,
                        );
                        const isActive = field.fieldKey === activeFieldKey;
                        return (
                          <div
                            key={field.fieldKey}
                            style={{
                              position: "absolute",
                              left,
                              top,
                              width,
                              height,
                              border: `${isActive ? 3 : 2}px solid ${isActive ? "#ff0000" : borderCss}`,
                              backgroundColor: isActive
                                ? "rgba(255, 0, 0, 0.06)"
                                : "rgba(0, 0, 0, 0.04)",
                              pointerEvents: "auto",
                              cursor: "pointer",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveFieldKey(field.fieldKey);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Stack>
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
                      data-field-key={field.fieldKey}
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
                          <ConfidenceIndicator confidence={field.confidence} />
                        </Group>
                        {(() => {
                          const displayValue =
                            correctionMap[field.fieldKey]?.corrected_value ??
                            enrichmentCorrectedValues.get(field.fieldKey) ??
                            field.value;
                          const isSelectionMark =
                            displayValue === ":selected:" ||
                            displayValue === ":unselected:";
                          if (isSelectionMark) {
                            return (
                              <Checkbox
                                data-field-key={field.fieldKey}
                                checked={displayValue === ":selected:"}
                                onChange={(event) =>
                                  handleFieldChange(
                                    field,
                                    event.currentTarget.checked
                                      ? ":selected:"
                                      : ":unselected:",
                                  )
                                }
                                disabled={readOnly}
                                label={
                                  displayValue === ":selected:"
                                    ? "Selected"
                                    : "Unselected"
                                }
                              />
                            );
                          }
                          return (
                            <Textarea
                              data-field-key={field.fieldKey}
                              value={displayValue}
                              onChange={(event) =>
                                handleFieldChange(
                                  field,
                                  event.currentTarget.value,
                                )
                              }
                              disabled={readOnly}
                              autosize
                              minRows={1}
                              error={
                                fieldValidators[field.fieldKey]
                                  ? fieldValidators[field.fieldKey]!(
                                      displayValue,
                                    )
                                  : undefined
                              }
                            />
                          );
                        })()}
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
              onChange={(event) =>
                setEscalationReason(event.currentTarget.value)
              }
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setEscalationOpen(false)}>
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
