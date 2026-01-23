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
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconDeviceFloppy, IconPencil } from "@tabler/icons-react";
import { useElementSize } from "@mantine/hooks";
import { useAuth } from "@/auth/AuthContext";
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

interface OcrWord {
  content: string;
  polygon: number[];
  confidence: number;
  span?: { offset: number; length: number };
  pageNumber: number;
  id: string;
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
  const { zoom, zoomIn, zoomOut, resetZoom } = useCanvasZoom();
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const { ref: pdfContainerRef, width: pdfWidth, height: pdfHeight } =
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

  const ocrWords = useMemo<OcrWord[]>(() => {
    const ocrResult = projectDocument?.labeling_document?.ocr_result as any;
    console.debug("[Labeling] OCR result shape", {
      hasOcr: Boolean(ocrResult),
      hasPages: Boolean(ocrResult?.pages),
      pageCount: ocrResult?.pages?.length,
    });
    if (!ocrResult?.pages) return [];

    const words: OcrWord[] = [];
    ocrResult.pages.forEach((page: any) => {
      const pageNumber = page.pageNumber ?? page.page_number ?? 1;
      (page.words || []).forEach((word: any, index: number) => {
        if (!word.polygon || word.polygon.length < 8) return;
        words.push({
          content: word.content,
          polygon: word.polygon,
          confidence: word.confidence ?? 0,
          span: word.span,
          pageNumber,
          id: `p${pageNumber}-w${index}`,
        });
      });
    });

    return words;
  }, [projectDocument?.labeling_document?.ocr_result]);

  const wordsByPage = useMemo(() => {
    const map: Record<number, OcrWord[]> = {};
    ocrWords.forEach((word) => {
      if (!map[word.pageNumber]) map[word.pageNumber] = [];
      map[word.pageNumber].push(word);
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
    console.debug("[Labeling] OCR words loaded", {
      totalWords: ocrWords.length,
      pages: Object.keys(wordsByPage),
    });
  }, [ocrWords, wordsByPage]);

  const wordBoxes = useMemo(() => {
    console.debug("[Labeling] Building word boxes", {
      totalWords: ocrWords.length,
      assignments: Object.keys(wordAssignments).length,
    });
    return ocrWords.map((word) => {
      const points = [];
      for (let i = 0; i < word.polygon.length; i += 2) {
        points.push({ x: word.polygon[i], y: word.polygon[i + 1] });
      }
      const assignedField = wordAssignments[word.id];
      const isActive = assignedField === activeFieldKey;
      return {
        id: word.id,
        box: { polygon: points },
        label: assignedField ?? undefined,
        color: assignedField ? (isActive ? "#228be6" : "#adb5bd") : "#ced4da",
        confidence: undefined,
      };
    });
  }, [ocrWords, wordAssignments, activeFieldKey]);

  const updateLabelsFromAssignments = useMemo(() => {
    console.debug("[Labeling] Updating labels from assignments", {
      assignments: Object.keys(wordAssignments).length,
    });
    const updates: Record<string, LabelState> = {};
    const wordsInOrder = [...ocrWords].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.id.localeCompare(b.id);
    });

    const grouped: Record<string, OcrWord[]> = {};
    Object.entries(wordAssignments).forEach(([wordId, fieldKey]) => {
      const word = ocrWords.find((item) => item.id === wordId);
      if (!word) return;
      if (!grouped[fieldKey]) grouped[fieldKey] = [];
      grouped[fieldKey].push(word);
    });

    Object.entries(grouped).forEach(([fieldKey, words]) => {
      const ordered = wordsInOrder.filter((word) =>
        words.some((w) => w.id === word.id),
      );
      const text = ordered.map((word) => word.content).join(" ");
      const minX = Math.min(...ordered.flatMap((word) =>
        word.polygon.filter((_, idx) => idx % 2 === 0),
      ));
      const minY = Math.min(...ordered.flatMap((word) =>
        word.polygon.filter((_, idx) => idx % 2 === 1),
      ));
      const maxX = Math.max(...ordered.flatMap((word) =>
        word.polygon.filter((_, idx) => idx % 2 === 0),
      ));
      const maxY = Math.max(...ordered.flatMap((word) =>
        word.polygon.filter((_, idx) => idx % 2 === 1),
      ));
      const ocrPage = (projectDocument?.labeling_document?.ocr_result as any)
        ?.pages?.find((p: any) => p.pageNumber === (ordered[0]?.pageNumber ?? 1));
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

  const handleWordSelect = (wordId: string | null) => {
    console.debug("[Labeling] Word selection clicked", {
      wordId,
      activeFieldKey,
    });
    if (!wordId) return;
    if (!activeFieldKey) {
      console.warn("[Labeling] No active field selected for assignment");
      notifications.show({
        title: "Select a field",
        message: "Choose a field on the right before assigning OCR boxes.",
        color: "yellow",
      });
      return;
    }
    setWordAssignments((prev) => {
      const current = prev[wordId];
      const next = { ...prev };
      if (current === activeFieldKey) {
        console.debug("[Labeling] Unassigning word from field", {
          wordId,
          fieldKey: activeFieldKey,
        });
        delete next[wordId];
      } else {
        console.debug("[Labeling] Assigning word to field", {
          wordId,
          fieldKey: activeFieldKey,
        });
        next[wordId] = activeFieldKey;
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
    const wordLookup = new Map(ocrWords.map((word) => [word.id, word]));
    const payload = Object.entries(wordAssignments)
      .map(([wordId, fieldKey]) => {
        const word = wordLookup.get(wordId);
        if (!word) return null;
        return {
          field_key: fieldKey,
          label_name: fieldKey,
          value: word.content,
          page_number: word.pageNumber,
          bounding_box: {
            polygon: word.polygon,
          },
          is_manual: false,
        };
      })
      .filter(Boolean) as LabelDto[];

    console.debug("[Labeling] Saving labels", {
      wordAssignments: Object.keys(wordAssignments).length,
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

      <Group align="stretch" gap="lg" style={{ flex: 1 }}>
        <Paper withBorder style={{ width: 320, minHeight: 0 }}>
          <Text size="sm" c="dimmed">Field panel:</Text>
          <FieldPanel
            fields={schema}
            values={labelValues}
            activeFieldKey={activeFieldKey}
            onSelectField={(fieldKey) => {
              console.debug("[Labeling] Field selected", { fieldKey });
              setActiveFieldKey(fieldKey);
            }}
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
          ) : ocrWords.length === 0 ? (
            <Stack align="center" justify="center" h="100%">
              <Text size="sm" c="dimmed">
                OCR results are not available yet.
              </Text>
            </Stack>
          ) : isPdf ? (
            <Stack gap="xs" style={{ height: "100%" }}>
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
                style={{ position: "relative", flex: 1, overflow: "auto" }}
                onClick={() => {
                  console.debug("[Labeling] PDF container clicked");
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
                      });
                    }}
                  />
                </Document>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                  }}
                >
                  {(wordsByPage[currentPage] || []).map((word) => {
                    const xs = word.polygon.filter((_, idx) => idx % 2 === 0);
                    const ys = word.polygon.filter((_, idx) => idx % 2 === 1);
                    const minX = Math.min(...xs);
                    const minY = Math.min(...ys);
                    const maxX = Math.max(...xs);
                    const maxY = Math.max(...ys);
                    const ocrPage = (projectDocument?.labeling_document?.ocr_result as any)
                      ?.pages?.find((p: any) => p.pageNumber === word.pageNumber);
                    const scaleX =
                      ocrPage?.width && pdfWidth
                        ? pdfWidth / ocrPage.width
                        : 1;
                    const scaleY =
                      ocrPage?.height && pdfHeight
                        ? pdfHeight / ocrPage.height
                        : 1;
                    const assignedField = wordAssignments[word.id];
                    const isActive = assignedField === activeFieldKey;
                    const borderColor = assignedField
                      ? isActive
                        ? "#228be6"
                        : "#adb5bd"
                      : "#ced4da";
                    return (
                      <div
                        key={word.id}
                        data-word-id={word.id}
                        style={{
                          position: "absolute",
                          left: minX * scaleX,
                          top: minY * scaleY,
                          width: (maxX - minX) * scaleX,
                          height: (maxY - minY) * scaleY,
                          border: `1px solid ${borderColor}`,
                          backgroundColor: assignedField
                            ? "rgba(34, 139, 230, 0.15)"
                            : "rgba(173, 181, 189, 0.08)",
                          pointerEvents: "auto",
                          cursor: "pointer",
                        }}
                        onClick={(event) => {
                          console.debug("[Labeling] OCR box clicked", {
                            wordId: word.id,
                            page: word.pageNumber,
                            activeFieldKey,
                            target: (event.target as HTMLElement)?.dataset?.wordId,
                          });
                          handleWordSelect(word.id);
                        }}
                        title={assignedField || "Unlabeled"}
                      />
                    );
                  })}
                </div>
              </div>
            </Stack>
          ) : (
            <div
              ref={canvasRef}
              style={{ width: "100%", height: "100%", overflow: "auto" }}
              onClick={() => {
                console.debug("[Labeling] Canvas container clicked");
              }}
            >
              <AnnotationCanvas
                imageUrl={documentUrl}
                width={canvasWidth || imageSize.width}
                height={canvasHeight || imageSize.height}
                boxes={wordBoxes}
                onBoxSelect={handleWordSelect}
              />
            </div>
          )}
        </Paper>
      </Group>
    </Stack>
  );
};
