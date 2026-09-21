import { FC, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
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
  alreadyExists: boolean;
}

const toRow = (suggestion: SuggestedField, index: number): Row => ({
  id: `${index}-${suggestion.field_key}`,
  include: !suggestion.already_exists,
  fieldKey: suggestion.field_key,
  fieldType: suggestion.field_type,
  description: suggestion.description,
  value: suggestion.value,
  alreadyExists: suggestion.already_exists,
});

export const SuggestFieldsModal: FC<SuggestFieldsModalProps> = ({
  opened,
  onClose,
  templateModelId,
  documents,
  onAddFields,
  onFieldsAdded,
}) => {
  const { suggestFieldsAsync, isSuggestingFields } =
    useFieldSuggestions(templateModelId);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const selectedDocumentId = documentId ?? documents[0]?.id ?? null;
  const includedCount = rows.filter((row) => row.include).length;
  const hasBlankKey = rows.some(
    (row) => row.include && row.fieldKey.trim() === "",
  );
  const typeOptions = useMemo(
    () => Object.values(FieldType).map((value) => ({ value, label: value })),
    [],
  );

  const handleClose = () => {
    setDocumentId(null);
    setRows([]);
    setError(null);
    onClose();
  };

  const handleSuggest = async () => {
    if (!selectedDocumentId) return;
    setError(null);
    try {
      const suggested = await suggestFieldsAsync(selectedDocumentId);
      setRows(suggested.map(toRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggesting fields failed");
    }
  };

  const handleAdd = async () => {
    if (!selectedDocumentId) return;
    setIsAdding(true);
    setError(null);
    try {
      const fields: CreateFieldDefinitionDto[] = rows
        .filter((row) => row.include)
        .map((row) => ({
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

  return (
    <Modal opened={opened} onClose={handleClose} title="Suggest fields">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Pick a document whose OCR has finished. The fields are suggested from
          what is filled in on it; check them before adding.
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
              onChange={(value) => setDocumentId(value)}
            />
            <Button
              onClick={() => void handleSuggest()}
              loading={isSuggestingFields}
              disabled={!selectedDocumentId}
            >
              Suggest
            </Button>
          </Group>
        )}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {isSuggestingFields && <Loader size="sm" />}
        {rows.map((row, index) => (
          <Group
            key={row.id}
            data-testid={`suggested-field-${index}`}
            align="flex-end"
            wrap="nowrap"
          >
            <Checkbox
              label="Include"
              checked={row.include}
              onChange={(event) =>
                updateRow(row.id, { include: event.currentTarget.checked })
              }
            />
            <TextInput
              label="Key"
              value={row.fieldKey}
              onChange={(event) =>
                updateRow(row.id, { fieldKey: event.currentTarget.value })
              }
            />
            <Select
              label="Type"
              data={typeOptions}
              value={row.fieldType}
              onChange={(value) => {
                if (value) updateRow(row.id, { fieldType: value as FieldType });
              }}
            />
            <TextInput
              label="Description"
              value={row.description}
              onChange={(event) =>
                updateRow(row.id, { description: event.currentTarget.value })
              }
            />
            <Text size="sm" c="dimmed">
              {row.value ?? "Not filled in on this document"}
            </Text>
            {row.alreadyExists && (
              <Badge size="sm" variant="light">
                Exists
              </Badge>
            )}
          </Group>
        ))}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleAdd()}
            loading={isAdding}
            disabled={includedCount === 0 || hasBlankKey}
          >
            {`Add ${includedCount} field${includedCount === 1 ? "" : "s"}`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
