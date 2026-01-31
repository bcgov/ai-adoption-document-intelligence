import { FC, useEffect, useMemo, useRef, useState } from "react";
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
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconDeviceFloppy, IconPencil } from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import { useAuth } from "@/auth/AuthContext";
import { colorForFieldKeyWithAlpha, colorForFieldKeyWithBorder } from "@/shared/utils";
import { AnnotationCanvas } from "../../core/canvas/AnnotationCanvas";
import { Document, Page, pdfjs } from "react-pdf";
import { ViewerToolbar } from "../../core/document-viewer/ViewerToolbar";
import { useCanvasZoom } from "../../core/canvas/hooks/useCanvasZoom";
import { FieldPanel } from "../../core/field-panel/FieldPanel";
import { useFieldSchema } from "../hooks/useFieldSchema";
import { useLabels, type LabelDto } from "../hooks/useLabels";
import { useProjectDocument } from "../hooks/useProjects";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

interface OcrElement {
  type: 'word' | 'selectionMark';
  content: string;
  polygon: number[];
  confidence: number;
  span?: { offset: number; length: number };
  pageNumber: number;
  id: string;
  state?: 'selected' | 'unselected'; // for selectionMarks
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
  const [wordAssignments, setWordAssignments] = useState<Record<string, string>>(
    {},
  );
  const [assignmentsHydrated, setAssignmentsHydrated] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>(
    { width: 1000, height: 1400 },
  );
  const { ref: canvasRef, width: canvasWidth, height: canvasHeight } =
    useElementSize();
  const { zoom, zoomIn, zoomOut, resetZoom, zoomToFit } = useCanvasZoom();
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const { ref: pdfContainerRef, width: pdfContainerWidth, height: pdfContainerHeight } =
    useElementSize();
  const [pdfRenderedSize, setPdfRenderedSize] = useState<{ width: number; height: number } | null>(null);
  const [pdfOriginalSize, setPdfOriginalSize] = useState<{ width: number; height: number } | null>(null);
  const initialZoomSetRef = useRef(false);

  // Auto-fit zoom when container dimensions and PDF size are available
  useEffect(() => {
    if (
      !initialZoomSetRef.current &&
      pdfContainerWidth > 0 &&
      pdfContainerHeight > 0 &&
      pdfOriginalSize
    ) {
      zoomToFit(pdfContainerWidth, pdfContainerHeight, pdfOriginalSize.width, pdfOriginalSize.height);
      initialZoomSetRef.current = true;
    }
  }, [pdfContainerWidth, pdfContainerHeight, pdfOriginalSize, zoomToFit]);

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
    setAssignmentsHydrated(false);
    setWordAssignments({});
  }, [documentId]);


  useEffect(() => {
    console.debug("[Labeling] Active field changed", {
      activeFieldKey,
    });
  }, [activeFieldKey]);

  useEffect(() => {
    const loadDocument = async () => {
      if (!projectDocument?.labeling_document) return;
      console.debug("[Labeling] Loading document file", {
        documentId,
        fileType: projectDocument.labeling_document.file_type,
        status: projectDocument.labeling_document.status,
      });
      try {
        const token = getAccessToken?.() ?? null;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(
          `/api/labeling/projects/${projectId}/documents/${documentId}/download`,
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
  }, [projectDocument?.labeling_document, getAccessToken, projectId, documentId]);

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

  const ocrWords = useMemo<OcrElement[]>(() => {
    const ocrResult = (projectDocument?.labeling_document?.ocr_result as any)
      ?.analyzeResult;
    console.debug("[Labeling] OCR result shape", {
      hasOcr: Boolean(ocrResult),
      hasPages: Boolean(ocrResult?.pages),
      pageCount: ocrResult?.pages?.length,
    });
    if (!ocrResult?.pages) return [];

    const elements: OcrElement[] = [];
    ocrResult.pages.forEach((page: any) => {
      const pageNumber = page.pageNumber ?? page.page_number ?? 1;

      // Extract words
      (page.words || []).forEach((word: any, index: number) => {
        if (!word.polygon || word.polygon.length < 8) return;
        elements.push({
          type: 'word',
          content: word.content,
          polygon: word.polygon,
          confidence: word.confidence ?? 0,
          span: word.span,
          pageNumber,
          id: `p${pageNumber}-w${index}`,
        });
      });

      // Extract selection marks (checkboxes)
      (page.selectionMarks || []).forEach((mark: any, index: number) => {
        if (!mark.polygon || mark.polygon.length < 8) return;
        elements.push({
          type: 'selectionMark',
          content: mark.state === 'selected' ? '☑' : '☐',
          polygon: mark.polygon,
          confidence: mark.confidence ?? 0,
          span: mark.span,
          pageNumber,
          id: `p${pageNumber}-sm${index}`,
          state: mark.state,
        });
      });
    });

    console.debug("[Labeling] Extracted OCR elements", {
      total: elements.length,
      words: elements.filter(e => e.type === 'word').length,
      selectionMarks: elements.filter(e => e.type === 'selectionMark').length,
    });

    return elements;
  }, [projectDocument?.labeling_document?.ocr_result]);

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
    const wordPolygonMap = new Map<string, string>();

    ocrWords.forEach((word) => {
      wordPolygonMap.set(word.id, polygonKey(word.polygon));
    });

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

    console.debug("[Labeling] Hydrated assignments from labels", {
      labels: labels.length,
      matched: Object.keys(nextAssignments).length,
    });

    setWordAssignments(nextAssignments);
    setAssignmentsHydrated(true);
  }, [labels, ocrWords, assignmentsHydrated]);

  useEffect(() => {
    console.debug("[Labeling] OCR elements loaded", {
      totalElements: ocrWords.length,
      words: ocrWords.filter(e => e.type === 'word').length,
      selectionMarks: ocrWords.filter(e => e.type === 'selectionMark').length,
      pages: Object.keys(wordsByPage),
    });
  }, [ocrWords, wordsByPage]);

  const wordBoxes = useMemo(() => {
    console.debug("[Labeling] Building element boxes", {
      totalElements: ocrWords.length,
      assignments: Object.keys(wordAssignments).length,
    });
    return ocrWords.map((element) => {
      const points = [];
      for (let i = 0; i < element.polygon.length; i += 2) {
        points.push({ x: element.polygon[i], y: element.polygon[i + 1] });
      }
      const assignedField = wordAssignments[element.id];
      const isActive = assignedField === activeFieldKey;
      const isCheckbox = element.type === 'selectionMark';

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
    console.debug("[Labeling] Updating labels from assignments", {
      assignments: Object.keys(wordAssignments).length,
    });
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
      const isSingleCheckbox = ordered.length === 1 && ordered[0].type === 'selectionMark';

      let text: string;
      if (isSingleCheckbox) {
        // For checkboxes, use the state value
        text = ordered[0].state || 'unselected';
      } else {
        // For words (or mixed), concatenate content
        text = ordered
          .filter(e => e.type === 'word')
          .map((element) => element.content)
          .join(" ");
      }

      const minX = Math.min(...ordered.flatMap((element) =>
        element.polygon.filter((_, idx) => idx % 2 === 0),
      ));
      const minY = Math.min(...ordered.flatMap((element) =>
        element.polygon.filter((_, idx) => idx % 2 === 1),
      ));
      const maxX = Math.max(...ordered.flatMap((element) =>
        element.polygon.filter((_, idx) => idx % 2 === 0),
      ));
      const maxY = Math.max(...ordered.flatMap((element) =>
        element.polygon.filter((_, idx) => idx % 2 === 1),
      ));
      const ocrPage = (projectDocument?.labeling_document?.ocr_result as any)
        ?.analyzeResult?.pages?.find(
          (p: any) => p.pageNumber === (ordered[0]?.pageNumber ?? 1),
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
        is_manual: false,
      };
    });

    return updates;
  }, [
    wordAssignments,
    ocrWords,
    imageSize.width,
    imageSize.height,
    projectDocument?.labeling_document?.ocr_result,
  ]);

  useEffect(() => {
    if (Object.keys(updateLabelsFromAssignments).length === 0) {
      return;
    }
    console.debug("[Labeling] Applying label updates", {
      fields: Object.keys(updateLabelsFromAssignments),
    });
    setLabelState((prev) => ({
      ...prev,
      ...updateLabelsFromAssignments,
    }));
  }, [updateLabelsFromAssignments]);

  const handleWordSelect = (elementId: string | null) => {
    console.debug("[Labeling] Element selection clicked", {
      elementId,
      activeFieldKey,
    });

    // If clicking on canvas background (null), deselect active field
    if (!elementId) {
      console.debug("[Labeling] Canvas background clicked - deselecting");
      setActiveFieldKey(null);
      return;
    }

    if (!activeFieldKey) {
      console.warn("[Labeling] No active field selected for assignment");
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
        console.debug("[Labeling] Unassigning element from field", {
          elementId,
          fieldKey: activeFieldKey,
        });
        delete next[elementId];
      } else {
        console.debug("[Labeling] Assigning element to field", {
          elementId,
          fieldKey: activeFieldKey,
        });
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
        confidence: prev[fieldKey]?.confidence,
        is_manual: true,
      },
    }));
  };

  const handleSave = async () => {
    const elementLookup = new Map(ocrWords.map((element) => [element.id, element]));
    const payload = Object.entries(wordAssignments)
      .map(([elementId, fieldKey]) => {
        const element = elementLookup.get(elementId);
        if (!element) return null;

        // For selection marks, use the state value; for words, use content
        const value = element.type === 'selectionMark'
          ? (element.state || 'unselected')
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
          is_manual: false,
        };
      })
      .filter(Boolean) as LabelDto[];

    console.debug("[Labeling] Saving labels", {
      elementAssignments: Object.keys(wordAssignments).length,
      payloadCount: payload.length,
      existingLabels: labels?.length ?? 0,
    });
    await saveLabelsAsync(payload);
  };

  if (isLoading || isLabelsLoading) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Loader size="lg" />
      </Stack>
    );
  }

  if (!projectDocument?.labeling_document) {
    return (
      <Stack align="center" justify="center" mih="70vh">
        <Text size="sm" c="dimmed">
          Document not found.
        </Text>
      </Stack>
    );
  }

  const documentName =
    projectDocument?.labeling_document?.original_filename || "Document";
  const isPdf = projectDocument?.labeling_document?.file_type === "pdf";

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
            <Title order={2}>{documentName}</Title>
            <Text size="sm" c="dimmed">
              Label fields by selecting OCR boxes
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

      <Group align="stretch" gap="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }} wrap="nowrap">
        <Paper withBorder style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", overflow: "hidden" }}>
          {!documentUrl ? (
            <Stack align="center" justify="center" style={{ position: "absolute", inset: 0 }}>
              <Text size="sm" c="dimmed">
                Document preview is unavailable.
              </Text>
            </Stack>
          ) : ocrWords.length === 0 ? (
            <Stack align="center" justify="center" style={{ position: "absolute", inset: 0 }}>
              <Text size="sm" c="dimmed">
                OCR results are not available yet.
              </Text>
            </Stack>
          ) : isPdf ? (
            <Stack gap="xs" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
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
                style={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto" }}
                onClick={(e) => {
                  // Deselect active field if clicking on PDF background (not on an overlay box)
                  if (e.target === e.currentTarget) {
                    console.debug("[Labeling] PDF background clicked - deselecting");
                    setActiveFieldKey(null);
                  }
                }}
              >
                <Document
                  file={documentUrl}
                  onLoadSuccess={({ numPages }) => {
                    console.debug("[Labeling] PDF loaded", { numPages });
                    setNumPages(numPages);
                  }}
                >
                  <Page
                    pageNumber={currentPage}
                    scale={zoom}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onLoadSuccess={(page) => {
                      console.debug("[Labeling] PDF page loaded", {
                        pageNumber: currentPage,
                        width: page.width,
                        height: page.height,
                        zoom,
                      });
                      setPdfRenderedSize({ width: page.width, height: page.height });
                      // Store original (unscaled) dimensions for zoom calculation
                      const originalWidth = page.width / zoom;
                      const originalHeight = page.height / zoom;
                      setPdfOriginalSize({ width: originalWidth, height: originalHeight });
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
                    const xs = element.polygon.filter((_, idx) => idx % 2 === 0);
                    const ys = element.polygon.filter((_, idx) => idx % 2 === 1);
                    const minX = Math.min(...xs);
                    const minY = Math.min(...ys);
                    const maxX = Math.max(...xs);
                    const maxY = Math.max(...ys);
                    const ocrPage = (projectDocument?.labeling_document?.ocr_result as any)
                      ?.analyzeResult?.pages?.find(
                        (p: any) => p.pageNumber === element.pageNumber,
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
                    const isCheckbox = element.type === 'selectionMark';

                    // Generate deterministic colors based on field key
                    let borderColor: string;
                    let backgroundColor: string;
                    let borderStyle: string;
                    let borderWidth: string;

                    if (assignedField) {
                      const fillColors = colorForFieldKeyWithAlpha(assignedField, 0.15);
                      const borderColors = colorForFieldKeyWithBorder(assignedField);
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
                          fontSize: isCheckbox ? `${Math.min((maxX - minX) * scaleX, (maxY - minY) * scaleY) * 0.8}px` : undefined,
                          fontWeight: "bold",
                          color: element.state === 'selected' ? "#228be6" : "#adb5bd",
                        }}
                        onClick={(event) => {
                          console.debug("[Labeling] OCR element clicked", {
                            elementId: element.id,
                            type: element.type,
                            page: element.pageNumber,
                            activeFieldKey,
                            target: (event.target as HTMLElement)?.dataset?.wordId,
                          });
                          handleWordSelect(element.id);
                        }}
                        title={assignedField || (isCheckbox ? `Checkbox (${element.state})` : "Unlabeled")}
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
              onClick={(e) => {
                // Deselect active field if clicking on canvas background
                if (e.target === e.currentTarget) {
                  console.debug("[Labeling] Canvas background clicked - deselecting");
                  setActiveFieldKey(null);
                }
              }}
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
              console.debug("[Labeling] Field panel background clicked - deselecting");
              setActiveFieldKey(null);
            }
          }}
        >
          <Text
            size="sm"
            fw={600}
            mb="md"
            onClick={(e) => {
              // Deselect when clicking on the header text
              console.debug("[Labeling] Field panel header clicked - deselecting");
              setActiveFieldKey(null);
              e.stopPropagation();
            }}
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
                // Deselect when clicking in the scroll area but not on a field
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('mantine-ScrollArea-viewport')) {
                  console.debug("[Labeling] Field panel scroll area clicked - deselecting");
                  setActiveFieldKey(null);
                }
              }
            }}
          >
            <FieldPanel
              fields={schema}
              values={labelValues}
              activeFieldKey={activeFieldKey}
              onSelectField={(fieldKey) => {
                console.debug("[Labeling] Field selected", { fieldKey });
                setActiveFieldKey(fieldKey);
              }}
              onValueChange={handleValueChange}
              readOnly={true}
            />
          </ScrollArea>
        </Paper>
      </Group>
    </Stack>
  );
};
