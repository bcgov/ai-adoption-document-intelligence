import { Group, Paper, ScrollArea, Stack, Text, TextInput } from "@mantine/core";
import { FC, useEffect, useRef, useState } from "react";
import { colorForFieldKeyWithBorder } from "@/shared/utils";
import { ConfidenceIndicator } from "./ConfidenceIndicator";

interface SnippetField {
  fieldKey: string;
  value: string;
  confidence?: number;
  boundingRegions?: Array<{ polygon: number[] }>;
}

interface SnippetViewProps {
  fields: SnippetField[];
  documentImage: HTMLImageElement | null;
  activeFieldKey: string | null;
  onFieldSelect: (fieldKey: string) => void;
  onFieldChange: (fieldKey: string, value: string) => void;
  correctionMap: Record<string, { corrected_value?: string }>;
  readOnly?: boolean;
}

interface CropResult {
  dataUrl: string;
  /** Aspect ratio (width / height) of the cropped region */
  aspectRatio: number;
  /** Area of the bounding box relative to the full image — indicates how much text/content is in this field */
  relativeArea: number;
}

const cropFieldSnippet = (
  image: HTMLImageElement,
  polygon: number[],
  padding = 0.3,
): CropResult | null => {
  if (polygon.length < 4) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < polygon.length; i += 2) {
    xs.push(polygon[i]);
    ys.push(polygon[i + 1]);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;
  const padX = boxWidth * padding;
  const padY = boxHeight * padding;

  const cropX = Math.max(0, minX - padX);
  const cropY = Math.max(0, minY - padY);
  const cropW = Math.min(image.naturalWidth - cropX, boxWidth + 2 * padX);
  const cropH = Math.min(image.naturalHeight - cropY, boxHeight + 2 * padY);

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const imageArea = image.naturalWidth * image.naturalHeight;
  const relativeArea = imageArea > 0 ? (boxWidth * boxHeight) / imageArea : 0;

  return {
    dataUrl: canvas.toDataURL(),
    aspectRatio: cropW / cropH,
    relativeArea,
  };
};

export const SnippetView: FC<SnippetViewProps> = ({
  fields,
  documentImage,
  activeFieldKey,
  onFieldSelect,
  onFieldChange,
  correctionMap,
  readOnly,
}) => {
  const [snippets, setSnippets] = useState<Record<string, CropResult | null>>({});
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!documentImage) return;
    const newSnippets: Record<string, CropResult | null> = {};
    for (const field of fields) {
      const polygon = field.boundingRegions?.[0]?.polygon;
      if (polygon) {
        newSnippets[field.fieldKey] = cropFieldSnippet(documentImage, polygon);
      } else {
        newSnippets[field.fieldKey] = null;
      }
    }
    setSnippets(newSnippets);
  }, [fields, documentImage]);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeFieldKey]);

  return (
    <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }} offsetScrollbars="present">
      <Stack gap="md" p="sm">
        {fields.map((field) => {
          const isActive = field.fieldKey === activeFieldKey;
          const cropResult = snippets[field.fieldKey];
          const { borderCss } = colorForFieldKeyWithBorder(field.fieldKey);
          const correctedValue = correctionMap[field.fieldKey]?.corrected_value;

          // Dynamic image width: larger regions (more text) get more space
          // Base: 300px, scales up to 500px for large fields
          const imageWidth = cropResult
            ? Math.round(300 + Math.min(cropResult.relativeArea * 4000, 200))
            : 300;
          // Dynamic max height based on content area
          const imageMaxHeight = cropResult
            ? Math.round(150 + Math.min(cropResult.relativeArea * 3000, 250))
            : 150;

          return (
            <Paper
              key={field.fieldKey}
              ref={isActive ? activeRowRef : undefined}
              withBorder
              p="sm"
              style={{
                borderColor: isActive ? "#ff0000" : borderCss,
                borderStyle: isActive ? "dashed" : "solid",
                borderWidth: isActive ? "3px" : "2px",
                cursor: "pointer",
              }}
              onClick={() => onFieldSelect(field.fieldKey)}
            >
              <Group align="flex-start" gap="md" wrap="nowrap">
                <div
                  style={{
                    width: imageWidth,
                    minWidth: imageWidth,
                    background: "#1a1a2e",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 80,
                  }}
                >
                  {cropResult ? (
                    <img
                      src={cropResult.dataUrl}
                      alt={`Source region for ${field.fieldKey}`}
                      style={{ maxWidth: "100%", maxHeight: imageMaxHeight, objectFit: "contain" }}
                    />
                  ) : (
                    <Text size="xs" c="dimmed" ta="center" p="xs">
                      No source region
                    </Text>
                  )}
                </div>
                <Stack gap="xs" style={{ flex: 1, minWidth: 200 }}>
                  <Group justify="space-between">
                    <Text fw={600} size="sm">{field.fieldKey}</Text>
                    <ConfidenceIndicator confidence={field.confidence} />
                  </Group>
                  <TextInput
                    value={correctedValue ?? field.value}
                    onChange={(e) => onFieldChange(field.fieldKey, e.currentTarget.value)}
                    disabled={readOnly}
                    size="sm"
                  />
                </Stack>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
};
