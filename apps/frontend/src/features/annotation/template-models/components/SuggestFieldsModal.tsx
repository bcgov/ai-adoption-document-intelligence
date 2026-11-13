import { FC, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "../../../../ui";
import { FieldType } from "../../core/types/field";
import type { CreateFieldDefinitionDto } from "../hooks/useFieldSchema";
import {
  type SuggestedField,
  useFieldSuggestions,
} from "../hooks/useFieldSuggestions";

export interface SuggestFieldsDocumentOption {
  /** Labelling document id. */
  id: string;
  name: string;
}

interface SuggestFieldsModalProps {
  opened: boolean;
  onClose: () => void;
  templateModelId: string;
  /** Documents whose OCR has finished. */
  documents: SuggestFieldsDocumentOption[];
  /** Keys already in the template model's schema. */
  existingKeys: string[];
  onAddFields: (fields: CreateFieldDefinitionDto[]) => Promise<void>;
  onFieldsAdded: (documentId: string, count: number) => void;
}

interface Row {
  id: string;
  include: boolean;
  fieldKey: string;
  fieldType: FieldType;
  description: string;
  value: string | null;
}

const toRow = (suggestion: SuggestedField, index: number): Row => ({
  id: `${index}-${suggestion.field_key}`,
  include: !suggestion.already_exists,
  fieldKey: suggestion.field_key,
  fieldType: suggestion.field_type,
  description: suggestion.description,
  value: suggestion.value,
});

export const SuggestFieldsModal: FC<SuggestFieldsModalProps> = ({
  opened,
  onClose,
  templateModelId,
  documents,
  existingKeys,
  onAddFields,
  onFieldsAdded,
}) => {
  const { suggestFieldsAsync, isSuggestingFields } =
    useFieldSuggestions(templateModelId);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Bumped whenever earlier results stop applying (a new request, a document
  // change, closing the window), so a reply that arrives late is dropped
  // instead of showing suggestions for the wrong document.
  const requestGeneration = useRef(0);

  const selectedDocumentId = documentId ?? documents[0]?.id ?? null;
  const selectedDocumentName =
    documents.find((doc) => doc.id === selectedDocumentId)?.name ??
    "the document";
  const existingKeySet = useMemo(() => new Set(existingKeys), [existingKeys]);
  const isExisting = (row: Row) => existingKeySet.has(row.fieldKey.trim());

  const includedRows = rows.filter((row) => row.include);
  const includedKeys = includedRows.map((row) => row.fieldKey.trim());
  const hasBlankKey = includedKeys.some((key) => key === "");
  const clashingKeys = [
    ...new Set(
      includedKeys.filter(
        (key, index) =>
          key !== "" &&
          (existingKeySet.has(key) || includedKeys.indexOf(key) !== index),
      ),
    ),
  ];
  const newRows = rows.filter((row) => !isExisting(row));
  const allNewIncluded =
    newRows.length > 0 && newRows.every((row) => row.include);
  const someNewIncluded = newRows.some((row) => row.include);
  const typeOptions = useMemo(
    () => Object.values(FieldType).map((value) => ({ value, label: value })),
    [],
  );

  const clearResults = () => {
    requestGeneration.current += 1;
    setRows([]);
    setError(null);
  };

  const handleClose = () => {
    clearResults();
    setDocumentId(null);
    onClose();
  };

  const handleDocumentChange = (value: string | null) => {
    clearResults();
    setDocumentId(value);
  };

  const handleSuggest = async () => {
    if (!selectedDocumentId) return;
    clearResults();
    const generation = requestGeneration.current;
    try {
      const suggested = await suggestFieldsAsync(selectedDocumentId);
      if (requestGeneration.current !== generation) return;
      setRows(suggested.map(toRow));
    } catch (err) {
      if (requestGeneration.current !== generation) return;
      setError(err instanceof Error ? err.message : "Suggesting fields failed");
    }
  };

  const handleAdd = async () => {
    if (!selectedDocumentId) return;
    setIsAdding(true);
    setError(null);
    try {
      const fields: CreateFieldDefinitionDto[] = includedRows.map((row) => ({
        field_key: row.fieldKey.trim(),
        field_type: row.fieldType,
        description: row.description.trim() || undefined,
      }));
      await onAddFields(fields);
      onFieldsAdded(selectedDocumentId, fields.length);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adding fields failed");
    } finally {
      setIsAdding(false);
    }
  };

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  const toggleAllNew = () =>
    setRows((current) =>
      current.map((row) =>
        isExisting(row) ? row : { ...row, include: !allNewIncluded },
      ),
    );

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Suggest fields"
      size="90%"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Pick a document whose OCR has finished. Fields are suggested from what
          is filled in on it. Check them before adding.
        </Text>
        {documents.length === 0 ? (
          <Text size="sm">No document has finished OCR yet.</Text>
        ) : (
          <Group align="flex-end">
            <Select
              label="Document"
              data={documents.map((doc) => ({
                value: doc.id,
                label: doc.name,
              }))}
              value={selectedDocumentId}
              onChange={handleDocumentChange}
              disabled={isSuggestingFields}
            />
            <Button
              onClick={() => void handleSuggest()}
              loading={isSuggestingFields}
              disabled={!selectedDocumentId || isSuggestingFields}
            >
              {rows.length > 0 ? "Suggest again" : "Suggest"}
            </Button>
          </Group>
        )}
        {isSuggestingFields && (
          <Group gap="xs" data-testid="suggest-fields-progress">
            <Loader size="sm" />
            <Text size="sm">
              Reading {selectedDocumentName}. This can take up to a minute.
            </Text>
          </Group>
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {rows.length > 0 && (
          <>
            <Text size="sm">
              {includedRows.length} of {rows.length} fields selected. Fields
              already in the schema start unticked.
            </Text>
            <div style={{ overflowX: "auto" }}>
              <DataTable>
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th style={{ width: 56 }}>
                      <Checkbox
                        aria-label="Include all new fields"
                        checked={allNewIncluded}
                        indeterminate={someNewIncluded && !allNewIncluded}
                        disabled={newRows.length === 0}
                        onChange={toggleAllNew}
                      />
                    </DataTable.Th>
                    <DataTable.Th style={{ width: "22%" }}>Key</DataTable.Th>
                    <DataTable.Th style={{ width: 170 }}>Type</DataTable.Th>
                    <DataTable.Th>Description</DataTable.Th>
                    <DataTable.Th style={{ width: "22%" }}>
                      Found on this document
                    </DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {rows.map((row, index) => (
                    <DataTable.Tr
                      key={row.id}
                      data-testid={`suggested-field-${index}`}
                      style={{ verticalAlign: "top" }}
                    >
                      <DataTable.Td>
                        <Checkbox
                          aria-label={`Include ${row.fieldKey || "this field"}`}
                          checked={row.include}
                          onChange={(event) =>
                            updateRow(row.id, {
                              include: event.currentTarget.checked,
                            })
                          }
                        />
                      </DataTable.Td>
                      <DataTable.Td>
                        <Stack gap={4}>
                          <TextInput
                            aria-label="Key"
                            value={row.fieldKey}
                            onChange={(event) =>
                              updateRow(row.id, {
                                fieldKey: event.currentTarget.value,
                              })
                            }
                          />
                          {isExisting(row) && (
                            <Badge size="sm" variant="light">
                              Already in schema
                            </Badge>
                          )}
                        </Stack>
                      </DataTable.Td>
                      <DataTable.Td>
                        <Select
                          aria-label="Type"
                          data={typeOptions}
                          value={row.fieldType}
                          fullWidth
                          onChange={(value) => {
                            if (value) {
                              updateRow(row.id, {
                                fieldType: value as FieldType,
                              });
                            }
                          }}
                        />
                      </DataTable.Td>
                      <DataTable.Td>
                        <Textarea
                          aria-label="Description"
                          value={row.description}
                          autosize
                          minRows={1}
                          maxRows={4}
                          onChange={(event) =>
                            updateRow(row.id, {
                              description: event.currentTarget.value,
                            })
                          }
                        />
                      </DataTable.Td>
                      <DataTable.Td>
                        <Text
                          size="sm"
                          c={row.value === null ? "dimmed" : undefined}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {row.value ?? "Not filled in on this document"}
                        </Text>
                      </DataTable.Td>
                    </DataTable.Tr>
                  ))}
                </DataTable.Tbody>
              </DataTable>
            </div>
          </>
        )}
        {hasBlankKey && (
          <Text size="sm" c="red">
            Every selected field needs a key.
          </Text>
        )}
        {clashingKeys.length > 0 && (
          <Text size="sm" c="red">
            Rename or untick these keys, which are already in the schema or used
            twice: {clashingKeys.join(", ")}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAdd()}
            loading={isAdding}
            disabled={
              includedRows.length === 0 ||
              hasBlankKey ||
              clashingKeys.length > 0 ||
              isSuggestingFields
            }
          >
            {`Add ${includedRows.length} field${includedRows.length === 1 ? "" : "s"}`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
