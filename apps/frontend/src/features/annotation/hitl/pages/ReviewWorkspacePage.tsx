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
import { IconArrowLeft } from "@tabler/icons-react";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { colorForFieldKeyWithBorder } from "@/shared/utils";
import { useCanvasZoom } from "../../core/canvas/hooks/useCanvasZoom";
import { ViewerToolbar } from "../../core/document-viewer/ViewerToolbar";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import { FieldFilterInput } from "../../core/field-panel/FieldFilterInput";
import { CorrectionAction } from "../../core/types/annotation";
import type { BoundingBox } from "../../core/types/canvas";
import { ConfidenceIndicator } from "../components/ConfidenceIndicator";
import { CorrectionHistory } from "../components/CorrectionHistory";
import { ReviewToolbar } from "../components/ReviewToolbar";
import { useReviewSession } from "../hooks/useReviewSession";

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
  const readOnly = false;

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

  useEffect(() => {
    initialZoomSetRef.current = false;
    setCurrentPage(1);
    setPdfRenderedSize(null);
    setPdfOriginalSize(null);
  }, [session?.document?.id]);

  useEffect(() => {
    const loadDocument = async () => {
      if (!session?.document?.id) {
        return;
      }
      try {
        const response = await fetch(
          `/api/documents/${session.document.id}/view`,
          { credentials: "include" },
        );
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setDocumentUrl(url);
      } catch {
        // Document load failed; leave URL unset
      }
    };

    void loadDocument();
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

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1)),
    [fields],
  );

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
      (correction) => correction.action === CorrectionAction.CORRECTED,
    );
    if (payload.length > 0) {
      await submitCorrectionsAsync(payload);
    }
    await approveSessionAsync();
    navigateToQueue();
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
                <div style={{ position: "relative", display: "inline-block" }}>
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
                      const height = (maxY - minY) * INCH_TO_PT * (rh / pageH);
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
                          enrichmentCorrectedValues.get(field.fieldKey) ??
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
