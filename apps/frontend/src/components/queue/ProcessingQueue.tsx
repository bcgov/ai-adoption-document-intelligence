import { useMemo, useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Title,
  Text,
  TextInput,
  Select,
  SimpleGrid,
  Badge,
  Table,
  Loader,
  Center,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconSearch, IconEye, IconRefresh } from '@tabler/icons-react';
import { useDocuments } from '../../data/hooks/useDocuments';
import type { Document, DocumentStatus } from '../../shared/types';
import { formatDate, formatFileSize } from '../../shared/utils';

interface ProcessingQueueProps {
  onSelectDocument?: (doc: Document) => void;
}

const statusOptions: { value: DocumentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pre_ocr', label: 'Waiting' },
  { value: 'ongoing_ocr', label: 'Processing' },
  { value: 'completed_ocr', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const statusStyles: Record<string, { color: string; label: string }> = {
  pre_ocr: { color: 'gray', label: 'Queued' },
  ongoing_ocr: { color: 'yellow', label: 'Processing' },
  completed_ocr: { color: 'green', label: 'Complete' },
  failed: { color: 'red', label: 'Failed' },
};

export function ProcessingQueue({ onSelectDocument }: ProcessingQueueProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const { data: documents, isLoading, isFetching, refetch } = useDocuments({ refetchInterval: 10000 });

  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    const needle = search.toLowerCase();
    return documents.filter((doc) => {
      const ministry = typeof doc.metadata?.ministry === 'string' ? (doc.metadata.ministry as string) : '';
      const matchesSearch =
        doc.title.toLowerCase().includes(needle) ||
        doc.original_filename.toLowerCase().includes(needle) ||
        ministry.toLowerCase().includes(needle);
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [documents, search, statusFilter]);

  const stats = useMemo(() => {
    const base = { total: documents?.length ?? 0, completed: 0, processing: 0, failed: 0 };
    documents?.forEach((doc) => {
      if (doc.status === 'completed_ocr') base.completed += 1;
      if (doc.status === 'ongoing_ocr') base.processing += 1;
      if (doc.status === 'failed') base.failed += 1;
    });
    return base;
  }, [documents]);

  return (
    <Paper shadow="sm" radius="md" p="lg" withBorder>
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={3}>Processing queue</Title>
            <Text size="sm" c="dimmed">
              Track OCR progress and open any document to review.
            </Text>
          </div>
          <Tooltip label="Refresh now">
            <ActionIcon variant="light" onClick={() => refetch()} loading={isFetching}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Paper radius="md" p="md" withBorder>
            <Text size="xs" c="dimmed">
              Total
            </Text>
            <Text fw={600} size="lg">
              {stats.total}
            </Text>
          </Paper>
          <Paper radius="md" p="md" withBorder>
            <Text size="xs" c="dimmed">
              Completed
            </Text>
            <Text fw={600} size="lg" c="green">
              {stats.completed}
            </Text>
          </Paper>
          <Paper radius="md" p="md" withBorder>
            <Text size="xs" c="dimmed">
              Processing / Failed
            </Text>
            <Text fw={600} size="lg">
              {stats.processing} / {stats.failed}
            </Text>
          </Paper>
        </SimpleGrid>

        <Group gap="md" align="flex-end">
          <TextInput
            placeholder="Search title or filename"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            flex={1}
          />
          <Select
            data={statusOptions}
            value={statusFilter}
            onChange={(value) => setStatusFilter((value as DocumentStatus | 'all') ?? 'all')}
            placeholder="Status"
            w={180}
          />
        </Group>

        {isLoading ? (
          <Center mih={160}>
            <Stack align="center" gap="xs">
              <Loader />
              <Text c="dimmed">Loading documents…</Text>
            </Stack>
          </Center>
        ) : filteredDocuments.length === 0 ? (
          <Center mih={160}>
            <Stack align="center" gap="xs">
              <Text size="xl">📄</Text>
              <Text>No documents match your filters.</Text>
              <Text size="sm" c="dimmed">
                Upload a file to get started.
              </Text>
            </Stack>
          </Center>
        ) : (
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Document</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredDocuments.map((doc) => {
                const status = statusStyles[doc.status] ?? { color: 'gray', label: doc.status };
                return (
                  <Table.Tr key={doc.id} onClick={() => onSelectDocument?.(doc)} style={{ cursor: 'pointer' }}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={600}>{doc.title}</Text>
                        <Text size="xs" c="dimmed">
                          {doc.original_filename}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={status.color} variant="light">
                        {status.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatFileSize(doc.file_size)}</Table.Td>
                    <Table.Td>{doc.source ?? '—'}</Table.Td>
                    <Table.Td>{formatDate(new Date(doc.created_at))}</Table.Td>
                    <Table.Td>
                      <Tooltip label="Open details">
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectDocument?.(doc);
                          }}
                        >
                          <IconEye size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

