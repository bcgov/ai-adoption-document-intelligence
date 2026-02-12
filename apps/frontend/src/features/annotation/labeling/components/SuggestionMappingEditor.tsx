import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { FC, useEffect, useMemo, useState } from "react";
import { FieldDefinition, FieldType } from "../../core/types/field";
import {
  SuggestionMapping,
  SuggestionRule,
  SuggestionSourceType,
} from "../hooks/useSuggestionMapping";

interface SuggestionMappingEditorProps {
  schema: FieldDefinition[];
  initialMapping: SuggestionMapping | null;
  onSave: (mapping: SuggestionMapping) => Promise<void>;
  isSaving?: boolean;
}

type EditableRule = {
  fieldKey: string;
  sourceType: SuggestionSourceType;
  keyAliases: string;
  selectionOrder: number | null;
  confidenceThreshold: number | null;
  tableAnchorText: string;
  tableRowLabelAliases: string;
  tableColumnLabel: string;
  tableWordOverlapThreshold: number | null;
};

const sourceOptions: Array<{ value: SuggestionSourceType; label: string }> = [
  { value: "keyValuePair", label: "Key-Value Pair" },
  { value: "selectionMarkOrder", label: "Selection Mark Order" },
  { value: "tableCellToWords", label: "Table Cell -> Words" },
];

const getDefaultSourceType = (fieldType: FieldType): SuggestionSourceType => {
  if (fieldType === FieldType.SELECTION_MARK) return "selectionMarkOrder";
  if (fieldType === FieldType.NUMBER) return "tableCellToWords";
  return "keyValuePair";
};

export const SuggestionMappingEditor: FC<SuggestionMappingEditorProps> = ({
  schema,
  initialMapping,
  onSave,
  isSaving = false,
}) => {
  const [rules, setRules] = useState<EditableRule[]>([]);

  const mappingByFieldKey = useMemo(() => {
    const map = new Map<string, SuggestionRule>();
    for (const rule of initialMapping?.rules ?? []) {
      map.set(rule.fieldKey, rule);
    }
    return map;
  }, [initialMapping]);

  useEffect(() => {
    const nextRules: EditableRule[] = schema
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((field) => {
        const existing = mappingByFieldKey.get(field.fieldKey);
        return {
          fieldKey: field.fieldKey,
          sourceType: existing?.sourceType ?? getDefaultSourceType(field.fieldType),
          keyAliases: (existing?.keyAliases ?? []).join(", "),
          selectionOrder: existing?.selectionOrder ?? null,
          confidenceThreshold: existing?.confidenceThreshold ?? null,
          tableAnchorText: existing?.table?.anchorText ?? "",
          tableRowLabelAliases: (existing?.table?.rowLabelAliases ?? []).join(", "),
          tableColumnLabel: existing?.table?.columnLabel ?? "",
          tableWordOverlapThreshold: existing?.table?.wordOverlapThreshold ?? null,
        };
      });
    setRules(nextRules);
  }, [schema, mappingByFieldKey]);

  const updateRule = (fieldKey: string, patch: Partial<EditableRule>) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.fieldKey === fieldKey
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    );
  };

  const handleReset = () => {
    const resetRules = schema
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((field) => ({
        fieldKey: field.fieldKey,
        sourceType: getDefaultSourceType(field.fieldType),
        keyAliases: "",
        selectionOrder: null,
        confidenceThreshold: null,
        tableAnchorText: "",
        tableRowLabelAliases: "",
        tableColumnLabel: "",
        tableWordOverlapThreshold: null,
      }));
    setRules(resetRules);
  };

  const handleSave = async () => {
    const normalizedRules: SuggestionRule[] = rules.map((rule) => {
      const next: SuggestionRule = {
        fieldKey: rule.fieldKey,
        sourceType: rule.sourceType,
      };

      if (rule.sourceType === "keyValuePair") {
        const keyAliases = rule.keyAliases
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (keyAliases.length > 0) next.keyAliases = keyAliases;
        if (rule.confidenceThreshold !== null) {
          next.confidenceThreshold = rule.confidenceThreshold;
        }
      }

      if (rule.sourceType === "selectionMarkOrder") {
        if (rule.selectionOrder !== null) {
          next.selectionOrder = rule.selectionOrder;
        }
      }

      if (rule.sourceType === "tableCellToWords") {
        const rowAliases = rule.tableRowLabelAliases
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        next.table = {
          ...(rule.tableAnchorText ? { anchorText: rule.tableAnchorText } : {}),
          ...(rowAliases.length > 0 ? { rowLabelAliases: rowAliases } : {}),
          ...(rule.tableColumnLabel ? { columnLabel: rule.tableColumnLabel } : {}),
          ...(rule.tableWordOverlapThreshold !== null
            ? { wordOverlapThreshold: rule.tableWordOverlapThreshold }
            : {}),
        };
      }

      return next;
    });

    await onSave({
      version: 1,
      rules: normalizedRules,
    });
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Configure per-field suggestion rules. Fields stay selectable only via OCR
        words and selection marks.
      </Text>
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Field</Table.Th>
            <Table.Th>Source</Table.Th>
            <Table.Th>Rule inputs</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rules.map((rule) => (
            <Table.Tr key={rule.fieldKey}>
              <Table.Td>
                <Text fw={500}>{rule.fieldKey}</Text>
              </Table.Td>
              <Table.Td>
                <Select
                  data={sourceOptions}
                  value={rule.sourceType}
                  onChange={(value) =>
                    updateRule(rule.fieldKey, {
                      sourceType: (value ?? "keyValuePair") as SuggestionSourceType,
                    })
                  }
                />
              </Table.Td>
              <Table.Td>
                <Stack gap="xs">
                  {rule.sourceType === "keyValuePair" && (
                    <>
                      <TextInput
                        size="xs"
                        label="Key aliases (comma-separated)"
                        value={rule.keyAliases}
                        onChange={(event) =>
                          updateRule(rule.fieldKey, {
                            keyAliases: event.currentTarget.value,
                          })
                        }
                      />
                      <NumberInput
                        size="xs"
                        label="Confidence threshold"
                        value={rule.confidenceThreshold}
                        min={0}
                        max={1}
                        step={0.05}
                        decimalScale={2}
                        onChange={(value) =>
                          updateRule(rule.fieldKey, {
                            confidenceThreshold:
                              typeof value === "number" ? value : null,
                          })
                        }
                      />
                    </>
                  )}
                  {rule.sourceType === "selectionMarkOrder" && (
                    <NumberInput
                      size="xs"
                      label="Selection order index"
                      value={rule.selectionOrder}
                      min={0}
                      step={1}
                      onChange={(value) =>
                        updateRule(rule.fieldKey, {
                          selectionOrder: typeof value === "number" ? value : null,
                        })
                      }
                    />
                  )}
                  {rule.sourceType === "tableCellToWords" && (
                    <>
                      <TextInput
                        size="xs"
                        label="Table anchor text"
                        value={rule.tableAnchorText}
                        onChange={(event) =>
                          updateRule(rule.fieldKey, {
                            tableAnchorText: event.currentTarget.value,
                          })
                        }
                      />
                      <TextInput
                        size="xs"
                        label="Row label aliases (comma-separated)"
                        value={rule.tableRowLabelAliases}
                        onChange={(event) =>
                          updateRule(rule.fieldKey, {
                            tableRowLabelAliases: event.currentTarget.value,
                          })
                        }
                      />
                      <TextInput
                        size="xs"
                        label="Column label"
                        value={rule.tableColumnLabel}
                        onChange={(event) =>
                          updateRule(rule.fieldKey, {
                            tableColumnLabel: event.currentTarget.value,
                          })
                        }
                      />
                      <NumberInput
                        size="xs"
                        label="Word overlap threshold"
                        value={rule.tableWordOverlapThreshold}
                        min={0}
                        max={1}
                        step={0.05}
                        decimalScale={2}
                        onChange={(value) =>
                          updateRule(rule.fieldKey, {
                            tableWordOverlapThreshold:
                              typeof value === "number" ? value : null,
                          })
                        }
                      />
                    </>
                  )}
                </Stack>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group justify="flex-end">
        <Button variant="subtle" onClick={handleReset} disabled={isSaving}>
          Reset to defaults
        </Button>
        <Button onClick={() => void handleSave()} loading={isSaving}>
          Save mapping
        </Button>
      </Group>
    </Stack>
  );
};
