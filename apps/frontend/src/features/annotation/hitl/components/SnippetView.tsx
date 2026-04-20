import {
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
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
}

const cropFieldSnippet = (
  image: HTMLImageElement,
  polygon: number[],
  padding = 0,
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

  return {
    dataUrl: canvas.toDataURL(),
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
  const [snippets, setSnippets] = useState<Record<string, CropResult | null>>(
    {},
  );
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
    activeRowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeFieldKey]);

  return (
    <ScrollArea
      type="auto"
      style={{ flex: 1, minHeight: 0 }}
      offsetScrollbars="present"
    >
      <Stack gap="md" p="sm">
        {fields.map((field) => {
          const isActive = field.fieldKey === activeFieldKey;
          const cropResult = snippets[field.fieldKey];
          const { borderCss } = colorForFieldKeyWithBorder(field.fieldKey);
          const correctedValue = correctionMap[field.fieldKey]?.corrected_value;

          return (
            <Paper
              key={field.fieldKey}
              ref={isActive ? activeRowRef : undefined}
              withBorder
              style={{
                borderColor: isActive ? "#ff0000" : borderCss,
                borderStyle: isActive ? "dashed" : "solid",
                borderWidth: isActive ? "3px" : "2px",
                cursor: "pointer",
                overflow: "hidden",
              }}
              onClick={() => onFieldSelect(field.fieldKey)}
            >
              <Stack gap="xs" p="sm">
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    {field.fieldKey}
                  </Text>
                  <ConfidenceIndicator confidence={field.confidence} />
                </Group>
                {(() => {
                  const displayValue = correctedValue ?? field.value;
                  const isSelectionMark =
                    displayValue === ":selected:" ||
                    displayValue === ":unselected:";
                  if (isSelectionMark) {
                    return (
                      <Checkbox
                        data-field-key={field.fieldKey}
                        checked={displayValue === ":selected:"}
                        onChange={(e) =>
                          onFieldChange(
                            field.fieldKey,
                            e.currentTarget.checked
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
                        size="sm"
                      />
                    );
                  }
                  return (
                    <Textarea
                      data-field-key={field.fieldKey}
                      value={displayValue}
                      onChange={(e) =>
                        onFieldChange(field.fieldKey, e.currentTarget.value)
                      }
                      disabled={readOnly}
                      size="sm"
                      autosize
                      minRows={1}
                    />
                  );
                })()}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                  }}
                >
                  {cropResult ? (
                    <img
                      src={cropResult.dataUrl}
                      alt={`Source region for ${field.fieldKey}`}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 200,
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <Text size="xs" c="dimmed" ta="center" p="xs">
                      No source region
                    </Text>
                  )}
                </div>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
};
