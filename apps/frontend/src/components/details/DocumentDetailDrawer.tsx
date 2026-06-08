import { IconAlertCircle, IconEye, IconForms } from "@tabler/icons-react";
import { useDocumentOcr } from "../../data/hooks/useDocumentOcr";
import type {
  Document,
  DocumentField,
  ExtractedFields,
} from "../../shared/types";
import { formatDate, formatFileSize } from "../../shared/utils";
import {
  Alert,
  Badge,
  DataTable,
  Drawer,
  Group,
  Image,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from "../../ui";

interface DocumentDetailDrawerProps {
  document: Document | null;
  opened: boolean;
  onClose: () => void;
}

function getFieldDisplayValue(field: DocumentField): string {
  if (field.valueSelectionMark !== undefined) {
    return field.valueSelectionMark === "selected"
      ? "☑ Selected"
      : "☐ Unselected";
  }
  if (field.valueNumber !== undefined) {
    return field.valueNumber.toString();
  }
  if (field.valueDate !== undefined) {
    return field.valueDate;
  }
  if (field.valueString !== undefined) {
    return field.valueString;
  }
  return field.content || "—";
}

function ExtractedFieldsTable({ fields }: { fields: ExtractedFields }) {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return <Text c="dimmed">No fields extracted.</Text>;
  }

  return (
    <DataTable striped highlightOnHover withTableBorder>
      <DataTable.Thead>
        <DataTable.Tr>
          <DataTable.Th>Field</DataTable.Th>
          <DataTable.Th>Value</DataTable.Th>
          <DataTable.Th>Type</DataTable.Th>
          <DataTable.Th>Confidence</DataTable.Th>
        </DataTable.Tr>
      </DataTable.Thead>
      <DataTable.Tbody>
        {entries.map(([name, field]) => (
          <DataTable.Tr key={name}>
            <DataTable.Td>
              <Text size="sm" fw={500}>
                {name}
              </Text>
            </DataTable.Td>
            <DataTable.Td>
              <Text size="sm">{getFieldDisplayValue(field)}</Text>
            </DataTable.Td>
            <DataTable.Td>
              <Badge size="xs" variant="light">
                {field.type}
              </Badge>
            </DataTable.Td>
            <DataTable.Td>
              <Text
                size="sm"
                c={
                  field.confidence >= 0.9
                    ? "green"
                    : field.confidence >= 0.7
                      ? "yellow"
                      : "red"
                }
              >
                {(field.confidence * 100).toFixed(1)}%
              </Text>
            </DataTable.Td>
          </DataTable.Tr>
        ))}
      </DataTable.Tbody>
    </DataTable>
  );
}

export function DocumentDetailDrawer({
  document,
  opened,
  onClose,
}: DocumentDetailDrawerProps) {
  const documentId = document?.id;
  const {
    data: ocrResult,
    isLoading,
    isError,
    error,
  } = useDocumentOcr(documentId);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title={document?.title ?? "Document details"}
      size="lg"
    >
      {!document ? (
        <Stack gap="sm">
          <Text fw={600}>Select a document to inspect its OCR output.</Text>
          <Text c="dimmed" size="sm">
            Use the queue on the left to choose a document.
          </Text>
        </Stack>
      ) : (
        <Stack gap="lg">
          <Stack gap={4}>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={600}>{document.title}</Text>
                <Text size="sm" c="dimmed">
                  {document.original_filename}
                </Text>
              </div>
              <Badge variant="light">{document.status ?? "unknown"}</Badge>
            </Group>

            <SimpleGrid cols={2} spacing="xs">
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  Created
                </Text>
                <Text size="sm">
                  {formatDate(new Date(document.created_at))}
                </Text>
              </Stack>
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  File size
                </Text>
                <Text size="sm">{formatFileSize(document.file_size)}</Text>
              </Stack>
            </SimpleGrid>
          </Stack>

          <Tabs defaultValue="fields">
            <Tabs.List grow>
              <Tabs.Tab value="fields" leftSection={<IconForms size={14} />}>
                Fields
              </Tabs.Tab>
              <Tabs.Tab value="image" leftSection={<IconEye size={14} />}>
                Document
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="fields" pt="md">
              {isLoading ? (
                <Stack gap="sm">
                  <Skeleton height={40} />
                  <Skeleton height={40} />
                  <Skeleton height={40} />
                </Stack>
              ) : isError ? (
                <Alert color="red" icon={<IconAlertCircle size={16} />}>
                  {error instanceof Error
                    ? error.message
                    : "Failed to load OCR output"}
                </Alert>
              ) : ocrResult?.ocr_result?.keyValuePairs ? (
                <ScrollArea h={400}>
                  <ExtractedFieldsTable
                    fields={ocrResult.ocr_result.keyValuePairs}
                  />
                </ScrollArea>
              ) : (
                <Text c="dimmed">No extracted fields for this document.</Text>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="image" pt="md">
              {document.file_url ? (
                <Image
                  src={document.file_url}
                  radius="md"
                  fallbackSrc=""
                  alt={document.title}
                />
              ) : (
                <Alert
                  title="Original file unavailable"
                  color="yellow"
                  icon={<IconAlertCircle size={16} />}
                  variant="light"
                >
                  The backend does not yet expose the raw file stream. Add a
                  download endpoint to preview the exact image here.
                </Alert>
              )}
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Drawer>
  );
}
