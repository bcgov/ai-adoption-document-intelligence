import {
  Alert,
  Badge,
  Drawer,
  Group,
  Image,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { IconAlertCircle, IconEye, IconForms } from "@tabler/icons-react";
import { useDocumentOcr } from "../../data/hooks/useDocumentOcr";
import type { Document, DocumentField, ExtractedFields } from "../../shared/types";
import { formatDate, formatFileSize } from "../../shared/utils";

interface DocumentDetailDrawerProps {
  document: Document | null;
  opened: boolean;
  onClose: () => void;
}

function getFieldDisplayValue(field: DocumentField): string {
  if (field.valueSelectionMark !== undefined) {
    return field.valueSelectionMark === "selected" ? "☑ Selected" : "☐ Unselected";
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
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Field</Table.Th>
          <Table.Th>Value</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Confidence</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map(([name, field]) => (
          <Table.Tr key={name}>
            <Table.Td>
              <Text size="sm" fw={500}>{name}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{getFieldDisplayValue(field)}</Text>
            </Table.Td>
            <Table.Td>
              <Badge size="xs" variant="light">{field.type}</Badge>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c={field.confidence >= 0.9 ? "green" : field.confidence >= 0.7 ? "yellow" : "red"}>
                {(field.confidence * 100).toFixed(1)}%
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
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
              ) : ocrResult?.keyValuePairs ? (
                <ScrollArea h={400}>
                  <ExtractedFieldsTable fields={ocrResult.keyValuePairs} />
                </ScrollArea>
              ) : (
                <Text c="dimmed">
                  No extracted fields for this document.
                </Text>
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
