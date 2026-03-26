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

const cropFieldSnippet = (
  image: HTMLImageElement,
  polygon: number[],
  padding = 0.2,
): string | null => {
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
  return canvas.toDataURL();
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
  const [snippets, setSnippets] = useState<Record<string, string | null>>({});
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!documentImage) return;
    const newSnippets: Record<string, string | null> = {};
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
          const snippet = snippets[field.fieldKey];
          const { borderCss } = colorForFieldKeyWithBorder(field.fieldKey);
          const correctedValue = correctionMap[field.fieldKey]?.corrected_value;

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
                    width: 200,
                    minWidth: 200,
                    background: "#1a1a2e",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 60,
                  }}
                >
                  {snippet ? (
                    <img
                      src={snippet}
                      alt={`Source region for ${field.fieldKey}`}
                      style={{ maxWidth: "100%", maxHeight: 150, objectFit: "contain" }}
                    />
                  ) : (
                    <Text size="xs" c="dimmed" ta="center" p="xs">
                      No source region
                    </Text>
                  )}
                </div>
                <Stack gap="xs" style={{ flex: 1 }}>
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
