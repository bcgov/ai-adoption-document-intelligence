import {
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconRefresh,
  IconRestore,
} from "@tabler/icons-react";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useNavigate, useParams } from "react-router-dom";
import {
  colorForFieldKeyWithAlpha,
  colorForFieldKeyWithBorder,
} from "@/shared/utils";
import { AnnotationCanvas } from "../../core/canvas/AnnotationCanvas";
import { useCanvasZoom } from "../../core/canvas/hooks/useCanvasZoom";
import { ViewerToolbar } from "../../core/document-viewer/ViewerToolbar";
import { FieldFilterInput } from "../../core/field-panel/FieldFilterInput";
import { FieldPanel } from "../../core/field-panel/FieldPanel";
import { useFieldSchema } from "../hooks/useFieldSchema";
import { type LabelDto, useLabels } from "../hooks/useLabels";
import { useTemplateModelDocument } from "../hooks/useTemplateModels";
import { useSuggestions } from "../hooks/useSuggestions";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
}

interface OcrElement {
  type: "word" | "selectionMark";
  content: string;
  polygon: number[];
  confidence: number;
  span?: { offset: number; length: number };
  pageNumber: number;
  id: string;
  state?: "selected" | "unselected"; // for selectionMarks
}

interface OcrWord {
  content: string;
  polygon: number[];
  confidence?: number;
  span?: { offset: number; length: number };
}

interface OcrSelectionMark {
  state: "selected" | "unselected";
  polygon: number[];
  confidence?: number;
  span?: { offset: number; length: number };
}

interface OcrPage {
  pageNumber?: number;
  page_number?: number;
  width?: number;
  height?: number;
  words?: OcrWord[];
  selectionMarks?: OcrSelectionMark[];
}

interface AnalyzeResult {
  pages?: OcrPage[];
}

interface AzureOcrResult {
  analyzeResult?: AnalyzeResult;
}

export const LabelingWorkspacePage: FC = () => {
  const navigate = useNavigate();
  const { modelId, documentId } = useParams<{
    modelId: string;
    documentId: string;
  }>();

  if (!modelId || !documentId) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Text size="sm" c="dimmed">
          Invalid URL parameters.
        </Text>
      </Stack>
    );
  }
  const { schema } = useFieldSchema(modelId);
  const [fieldFilter, setFieldFilter] = useState("");
  const filteredSchema = useMemo(() => {
    if (!fieldFilter) return schema;
    const lower = fieldFilter.toLowerCase();
    return schema.filter(
      (f) =>
        f.fieldKey.toLowerCase().includes(lower) ||
        f.fieldType.toLowerCase().includes(lower),
    );
  }, [schema, fieldFilter]);
  const { document: templateModelDocument, isLoading } =
    useTemplateModelDocument(modelId, documentId);
  const {
    labels,
    isLoading: isLabelsLoading,
    saveLabelsAsync,
    isSaving,
  } = useLabels(modelId, documentId);
  const { loadSuggestionsAsync, isLoadingSuggestions } = useSuggestions(
    modelId,
    documentId,
  );
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [labelState, setLabelState] = useState<Record<string, LabelState>>({});
  const [wordAssignments, setWordAssignments] = useState<
    Record<string, string>
  >({});
  const [assignmentsHydrated, setAssignmentsHydrated] = useState(false);
  const [autoSuggestionApplied, setAutoSuggestionApplied] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>(
    { width: 1000, height: 1400 },
  );
  const {
    ref: canvasRef,
    width: canvasWidth,
    height: canvasHeight,
  } = useElementSize();
  const { zoom, zoomIn, zoomOut, resetZoom, zoomToFit } = useCanvasZoom();
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
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

  // Auto-fit zoom when container dimensions and PDF size are available
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
    // Group labels by field_key since the server returns individual labels for each word
    const grouped: Record<string, LabelDto[]> = {};
    (labels || []).forEach((label) => {
      const fieldKey = label.field_key;
      if (!grouped[fieldKey]) grouped[fieldKey] = [];
      grouped[fieldKey].push(label);
    });

    // Combine multiple labels per field into a single LabelState
    const mapped: Record<string, LabelState> = {};
    Object.entries(grouped).forEach(([fieldKey, fieldLabels]) => {
      // Sort labels by their position in the document (using span offset if available)
      const sorted = fieldLabels.sort((a, b) => {
        const offsetA = a.bounding_box.span?.offset ?? 0;
        const offsetB = b.bounding_box.span?.offset ?? 0;
        return offsetA - offsetB;
      });

      // Concatenate values from all labels for this field
      const combinedValue = sorted
        .map((label) => label.value)
        .filter(Boolean)
        .join(" ");

      // Calculate combined bounding box
      const allPolygons = sorted
        .map((label) => label.bounding_box?.polygon)
        .filter(Boolean) as number[][];

      let combinedBoundingBox;
      if (allPolygons.length > 0) {
        const minX = Math.min(
          ...allPolygons.flatMap((p) => p.filter((_, idx) => idx % 2 === 0)),
        );
        const minY = Math.min(
          ...allPolygons.flatMap((p) => p.filter((_, idx) => idx % 2 === 1)),
        );
        const maxX = Math.max(
          ...allPolygons.flatMap((p) => p.filter((_, idx) => idx % 2 === 0)),
        );
        const maxY = Math.max(
          ...allPolygons.flatMap((p) => p.filter((_, idx) => idx % 2 === 1)),
        );
        combinedBoundingBox = {
          polygon: [minX, minY, maxX, minY, maxX, maxY, minX, maxY],
        };
      }

      mapped[fieldKey] = {
        field_key: fieldKey,
        label_name: sorted[0].label_name ?? fieldKey,
        value: combinedValue,
        page_number: sorted[0].page_number ?? 1,
        bounding_box: combinedBoundingBox,
      };
    });

    setLabelState(mapped);
  }, [labels]);

  useEffect(() => {
    setAssignmentsHydrated(false);
    setWordAssignments({});
    setAutoSuggestionApplied(false);
  }, [documentId]);

  useEffect(() => {
    const loadDocument = async () => {
      if (!templateModelDocument?.labeling_document) return;
      try {
        const response = await fetch(
          `/api/template-models/${modelId}/documents/${documentId}/download`,
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
  }, [templateModelDocument?.labeling_document, modelId, documentId]);

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
    const values: Record<string, { value?: string }> = {};
    Object.values(labelState).forEach((label) => {
      values[label.field_key] = {
        value: label.value,
      };
    });
    return values;
  }, [labelState]);

  const ocrWords = useMemo<OcrElement[]>(() => {
    const azureOcr = templateModelDocument?.labeling_document?.ocr_result as
      | AzureOcrResult
      | undefined;
    const ocrResult = azureOcr?.analyzeResult;
    if (!ocrResult?.pages) return [];

    const elements: OcrElement[] = [];
    ocrResult.pages.forEach((page) => {
      const pageNumber = page.pageNumber ?? page.page_number ?? 1;

      // Extract words
      (page.words || []).forEach((word, index: number) => {
        if (!word.polygon || word.polygon.length < 8) return;
        elements.push({
          type: "word",
          content: word.content,
          polygon: word.polygon,
          confidence: word.confidence ?? 0,
          span: word.span,
          pageNumber,
          id: `p${pageNumber}-w${index}`,
        });
      });

      // Extract selection marks (checkboxes)
      (page.selectionMarks || []).forEach((mark, index: number) => {
        if (!mark.polygon || mark.polygon.length < 8) return;
        elements.push({
          type: "selectionMark",
          content: mark.state === "selected" ? "☑" : "☐",
          polygon: mark.polygon,
          confidence: mark.confidence ?? 0,
          span: mark.span,
          pageNumber,
          id: `p${pageNumber}-sm${index}`,
          state: mark.state,
        });
      });
    });

    return elements;
  }, [templateModelDocument?.labeling_document?.ocr_result]);

  const wordsByPage = useMemo(() => {
    const map: Record<number, OcrElement[]> = {};
    ocrWords.forEach((element) => {
      if (!map[element.pageNumber]) map[element.pageNumber] = [];
      map[element.pageNumber].push(element);
    });
    return map;
  }, [ocrWords]);

  useEffect(() => {
    if (
      assignmentsHydrated ||
      !labels ||
      labels.length === 0 ||
      ocrWords.length === 0
    ) {
      return;
    }

    const nextAssignments: Record<string, string> = {};
    const polygonKey = (polygon: number[]) => polygon.join(",");

    const polygonToWord = new Map<string, string>();
    ocrWords.forEach((word) => {
      polygonToWord.set(polygonKey(word.polygon), word.id);
    });

    labels.forEach((label) => {
      const polygon = label.bounding_box?.polygon;
      if (!polygon || polygon.length < 8) return;
      const wordId = polygonToWord.get(polygonKey(polygon));
      if (wordId) {
        nextAssignments[wordId] = label.field_key;
      }
    });

    setWordAssignments(nextAssignments);
    setAssignmentsHydrated(true);
  }, [labels, ocrWords, assignmentsHydrated]);

  const applySuggestionsToAssignments = (
    suggestions: Array<{ field_key: string; element_ids: string[] }>,
  ) => {
    const elementSet = new Set(ocrWords.map((element) => element.id));
    const nextAssignments: Record<string, string> = {};

    for (const suggestion of suggestions) {
      for (const elementId of suggestion.element_ids) {
        if (!elementSet.has(elementId)) {
          continue;
        }
        if (nextAssignments[elementId]) {
          continue;
        }
        nextAssignments[elementId] = suggestion.field_key;
      }
    }
    setWordAssignments(nextAssignments);
  };

  const handleLoadSuggestions = async () => {
    try {
      const suggestions = await loadSuggestionsAsync();
      applySuggestionsToAssignments(suggestions);
      notifications.show({
        title: "Suggestions loaded",
        message: `Applied ${suggestions.length} field suggestions.`,
        color: "blue",
      });
    } catch (error) {
      notifications.show({
        title: "Failed to load suggestions",
        message:
          error instanceof Error
            ? error.message
            : "An error occurred while loading suggestions.",
        color: "red",
      });
    }
  };

  const handleResetAssignments = () => {
    setWordAssignments({});
    setLabelState({});
    setActiveFieldKey(null);
    notifications.show({
      title: "Assignments reset",
      message: "All current assignments were cleared.",
      color: "gray",
    });
  };

  useEffect(() => {
    if (
      autoSuggestionApplied ||
      isLoadingSuggestions ||
      isLabelsLoading ||
      labels.length > 0 ||
      Object.keys(wordAssignments).length > 0 ||
      ocrWords.length === 0
    ) {
      return;
    }

    const run = async () => {
      try {
        const suggestions = await loadSuggestionsAsync();
        applySuggestionsToAssignments(suggestions);
      } catch (error) {
        void error;
      } finally {
        setAutoSuggestionApplied(true);
      }
    };

    void run();
  }, [
    autoSuggestionApplied,
    isLoadingSuggestions,
    isLabelsLoading,
    labels,
    wordAssignments,
    ocrWords,
    loadSuggestionsAsync,
  ]);

  const wordBoxes = useMemo(() => {
    return ocrWords.map((element) => {
      const points = [];
      for (let i = 0; i < element.polygon.length; i += 2) {
        points.push({ x: element.polygon[i], y: element.polygon[i + 1] });
      }
      const assignedField = wordAssignments[element.id];
      const isActive = assignedField === activeFieldKey;
      const isCheckbox = element.type === "selectionMark";

      // Generate deterministic color based on field key
      let color: string;
      if (assignedField) {
        const { borderCss } = colorForFieldKeyWithBorder(assignedField);
        color = borderCss;
      } else if (isCheckbox) {
        color = "#FFA500";
      } else {
        color = "#ced4da";
      }

      return {
        id: element.id,
        box: { polygon: points },
        label: assignedField ?? undefined,
        color,
        confidence: undefined,
        isActive,
      };
    });
  }, [ocrWords, wordAssignments, activeFieldKey]);

  const updateLabelsFromAssignments = useMemo(() => {
    const updates: Record<string, LabelState> = {};
    const elementsInOrder = [...ocrWords].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.id.localeCompare(b.id);
    });

    const grouped: Record<string, OcrElement[]> = {};
    Object.entries(wordAssignments).forEach(([elementId, fieldKey]) => {
      const element = ocrWords.find((item) => item.id === elementId);
      if (!element) return;
      if (!grouped[fieldKey]) grouped[fieldKey] = [];
      grouped[fieldKey].push(element);
    });

    Object.entries(grouped).forEach(([fieldKey, elements]) => {
      const ordered = elementsInOrder.filter((element) =>
        elements.some((e) => e.id === element.id),
      );

      // Check if this is a single selection mark (checkbox)
      const isSingleCheckbox =
        ordered.length === 1 && ordered[0].type === "selectionMark";

      let text: string;
      if (isSingleCheckbox) {
        // For checkboxes, use the state value
        text = ordered[0].state || "unselected";
      } else {
        // For words (or mixed), concatenate content
        text = ordered
          .filter((e) => e.type === "word")
          .map((element) => element.content)
          .join(" ");
      }

      const minX = Math.min(
        ...ordered.flatMap((element) =>
          element.polygon.filter((_, idx) => idx % 2 === 0),
        ),
      );
      const minY = Math.min(
        ...ordered.flatMap((element) =>
          element.polygon.filter((_, idx) => idx % 2 === 1),
        ),
      );
      const maxX = Math.max(
        ...ordered.flatMap((element) =>
          element.polygon.filter((_, idx) => idx % 2 === 0),
        ),
      );
      const maxY = Math.max(
        ...ordered.flatMap((element) =>
          element.polygon.filter((_, idx) => idx % 2 === 1),
        ),
      );
      const azureOcr = templateModelDocument?.labeling_document?.ocr_result as
        | AzureOcrResult
        | undefined;
      const ocrPage = azureOcr?.analyzeResult?.pages?.find(
        (p) => p.pageNumber === (ordered[0]?.pageNumber ?? 1),
      );
      updates[fieldKey] = {
        field_key: fieldKey,
        label_name: fieldKey,
        value: text,
        page_number: ordered[0]?.pageNumber ?? 1,
        bounding_box: {
          polygon: [minX, minY, maxX, minY, maxX, maxY, minX, maxY],
          pageWidth: ocrPage?.width ?? imageSize.width,
          pageHeight: ocrPage?.height ?? imageSize.height,
        },
      };
    });

    return updates;
  }, [
    wordAssignments,
    ocrWords,
    imageSize.width,
    imageSize.height,
    templateModelDocument?.labeling_document?.ocr_result,
  ]);

  useEffect(() => {
    if (Object.keys(updateLabelsFromAssignments).length === 0) {
      return;
    }
    setLabelState((prev) => ({
      ...prev,
      ...updateLabelsFromAssignments,
    }));
  }, [updateLabelsFromAssignments]);

  const handleWordSelect = (elementId: string | null) => {
    // If clicking on canvas background (null), deselect active field
    if (!elementId) {
      setActiveFieldKey(null);
      return;
    }

    if (!activeFieldKey) {
      notifications.show({
        title: "Select a field",
        message: "Choose a field on the right before assigning OCR elements.",
        color: "yellow",
      });
      return;
    }
    setWordAssignments((prev) => {
      const current = prev[elementId];
      const next = { ...prev };
      if (current === activeFieldKey) {
        delete next[elementId];
      } else {
        next[elementId] = activeFieldKey;
      }
      return next;
    });
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
      },
    }));
  };

  const handleSave = async () => {
    const elementLookup = new Map(
      ocrWords.map((element) => [element.id, element]),
    );
    const payload = Object.entries(wordAssignments)
      .map(([elementId, fieldKey]) => {
        const element = elementLookup.get(elementId);
        if (!element) return null;

        // For selection marks, use the state value; for words, use content
        const value =
          element.type === "selectionMark"
            ? element.state || "unselected"
            : element.content;

        return {
          field_key: fieldKey,
          label_name: fieldKey,
          value: value,
          page_number: element.pageNumber,
          bounding_box: {
            polygon: element.polygon,
            span: element.span,
          },
        };
      })
      .filter(Boolean) as LabelDto[];

    try {
      await saveLabelsAsync(payload);
      notifications.show({
        title: "Labels saved",
        message: "Your labels have been saved successfully.",
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: "Failed to save labels",
        message:
          error instanceof Error
            ? error.message
            : "An error occurred while saving.",
        color: "red",
      });
    }
  };

  if (isLoading || isLabelsLoading) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Loader size="lg" />
      </Stack>
    );
  }

  if (!templateModelDocument?.labeling_document) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Text size="sm" c="dimmed">
          Document not found.
        </Text>
      </Stack>
    );
  }

  const documentName =
    templateModelDocument?.labeling_document?.original_filename || "Document";
  const isPdf = templateModelDocument?.labeling_document?.file_type === "pdf";

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
            onClick={() => navigate(`/template-models/${modelId}`)}
          >
            Back
          </Button>
          <Stack gap={2}>
            <Title order={2}>{documentName}</Title>
            <Text size="sm" c="dimmed">
              Label fields by selecting OCR boxes
            </Text>
          </Stack>
        </Group>
        <Group>
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void handleLoadSuggestions()}
            loading={isLoadingSuggestions}
          >
            Load suggestions
          </Button>
          <Button
            variant="default"
            leftSection={<IconRestore size={16} />}
            onClick={handleResetAssignments}
            disabled={Object.keys(wordAssignments).length === 0}
          >
            Reset
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
          ) : ocrWords.length === 0 ? (
            <Stack
              align="center"
              justify="center"
              style={{ position: "absolute", inset: 0 }}
            >
              <Text size="sm" c="dimmed">
                OCR results are not available yet.
              </Text>
            </Stack>
          ) : isPdf ? (
            <Stack
              gap="xs"
              style={{ position: "absolute", inset: 0, overflow: "hidden" }}
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
                  // Deselect active field if clicking on PDF background (not on an overlay box)
                  if (e.target === e.currentTarget) {
                    setActiveFieldKey(null);
                  }
                }}
              >
                <Document
                  file={documentUrl}
                  onLoadSuccess={({ numPages }) => {
                    setNumPages(numPages);
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
                      // Store original (unscaled) dimensions for zoom calculation
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
                  {(wordsByPage[currentPage] || []).map((element) => {
                    const xs = element.polygon.filter(
                      (_, idx) => idx % 2 === 0,
                    );
                    const ys = element.polygon.filter(
                      (_, idx) => idx % 2 === 1,
                    );
                    const minX = Math.min(...xs);
                    const minY = Math.min(...ys);
                    const maxX = Math.max(...xs);
                    const maxY = Math.max(...ys);
                    const azureOcr = templateModelDocument?.labeling_document
                      ?.ocr_result as AzureOcrResult | undefined;
                    const ocrPage = azureOcr?.analyzeResult?.pages?.find(
                      (p) => p.pageNumber === element.pageNumber,
                    );
                    const scaleX =
                      ocrPage?.width && pdfRenderedSize?.width
                        ? pdfRenderedSize.width / ocrPage.width
                        : zoom;
                    const scaleY =
                      ocrPage?.height && pdfRenderedSize?.height
                        ? pdfRenderedSize.height / ocrPage.height
                        : zoom;
                    const assignedField = wordAssignments[element.id];
                    const isActive = assignedField === activeFieldKey;
                    const isCheckbox = element.type === "selectionMark";

                    // Generate deterministic colors based on field key
                    let borderColor: string;
                    let backgroundColor: string;
                    let borderStyle: string;
                    let borderWidth: string;

                    if (assignedField) {
                      const fillColors = colorForFieldKeyWithAlpha(
                        assignedField,
                        0.15,
                      );
                      const borderColors =
                        colorForFieldKeyWithBorder(assignedField);
                      borderColor = borderColors.borderCss;
                      backgroundColor = fillColors.fillCssAlpha;
                      borderStyle = isActive ? "dashed" : "solid";
                      borderWidth = isActive ? "3px" : "2px";
                      if (isActive) borderColor = "#ff0000";
                    } else if (isCheckbox) {
                      borderColor = "#FFA500";
                      backgroundColor = "rgba(255, 165, 0, 0.1)";
                      borderStyle = "solid";
                      borderWidth = "2px";
                    } else {
                      borderColor = "#ced4da";
                      backgroundColor = "rgba(173, 181, 189, 0.08)";
                      borderStyle = "solid";
                      borderWidth = "1px";
                    }

                    return (
                      <div
                        key={element.id}
                        data-word-id={element.id}
                        style={{
                          position: "absolute",
                          left: minX * scaleX,
                          top: minY * scaleY,
                          width: (maxX - minX) * scaleX,
                          height: (maxY - minY) * scaleY,
                          border: `${borderWidth} ${borderStyle} ${borderColor}`,
                          backgroundColor,
                          pointerEvents: "auto",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: isCheckbox
                            ? `${Math.min((maxX - minX) * scaleX, (maxY - minY) * scaleY) * 0.8}px`
                            : undefined,
                          fontWeight: "bold",
                          color:
                            element.state === "selected"
                              ? "#228be6"
                              : "#adb5bd",
                        }}
                        onClick={() => {
                          handleWordSelect(element.id);
                        }}
                        title={
                          assignedField ||
                          (isCheckbox
                            ? `Checkbox (${element.state})`
                            : "Unlabeled")
                        }
                      >
                        {isCheckbox ? element.content : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Stack>
          ) : (
            <div
              ref={canvasRef}
              style={{ position: "absolute", inset: 0, overflow: "hidden" }}
            >
              {canvasWidth > 0 && canvasHeight > 0 && (
                <AnnotationCanvas
                  imageUrl={documentUrl}
                  width={canvasWidth}
                  height={canvasHeight}
                  boxes={wordBoxes}
                  onBoxSelect={handleWordSelect}
                />
              )}
            </div>
          )}
        </Paper>

        <Paper
          withBorder
          p="md"
          style={{
            width: 320,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => {
            // Deselect active field if clicking on field panel background
            if (e.target === e.currentTarget) {
              setActiveFieldKey(null);
            }
          }}
        >
          <Text
            size="sm"
            fw={600}
            mb="md"
            onClick={(e) => {
              setActiveFieldKey(null);
              e.stopPropagation();
            }}
          >
            Fields
          </Text>

          <FieldFilterInput
            value={fieldFilter}
            onChange={setFieldFilter}
            totalCount={schema.length}
            filteredCount={filteredSchema.length}
          />

          <ScrollArea
            type="auto"
            style={{ flex: 1, minHeight: 0 }}
            offsetScrollbars="present"
            viewportProps={{
              style: { paddingRight: 16 },
              onClick: (e: React.MouseEvent) => {
                // Deselect when clicking in the scroll area but not on a field
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
            <FieldPanel
              fields={filteredSchema}
              values={labelValues}
              activeFieldKey={activeFieldKey}
              onSelectField={(fieldKey) => {
                setActiveFieldKey(fieldKey);
              }}
              onValueChange={handleValueChange}
              readOnly={true}
              emptyMessage={
                fieldFilter
                  ? "No fields match your search."
                  : "Add fields to this template model before labeling documents."
              }
            />
          </ScrollArea>
        </Paper>
      </Group>
    </Stack>
  );
};
