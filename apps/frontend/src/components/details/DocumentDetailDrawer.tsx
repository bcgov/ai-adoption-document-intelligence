import {
  Drawer,
  Tabs,
  Image,
  ScrollArea,
  Text,
  Stack,
  Group,
  Badge,
  SimpleGrid,
  Button,
  Skeleton,
  CopyButton,
  Tooltip,
  Alert,
} from '@mantine/core';
import { IconAlertCircle, IconCopy, IconEye } from '@tabler/icons-react';
import { useDocumentOcr } from '../../data/hooks/useDocumentOcr';
import type { Document } from '../../shared/types';
import { formatDate, formatFileSize } from '../../shared/utils';

interface DocumentDetailDrawerProps {
  document: Document | null;
  opened: boolean;
  onClose: () => void;
}

export function DocumentDetailDrawer({ document, opened, onClose }: DocumentDetailDrawerProps) {
  const documentId = document?.id;
  const { data: ocrResult, isLoading, isError, error } = useDocumentOcr(documentId);

  return (
    <Drawer opened={opened} onClose={onClose} position="right" title={document?.title ?? 'Document details'} size="lg">
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
              <Badge variant="light">{document.status ?? 'unknown'}</Badge>
            </Group>
            <SimpleGrid cols={2} spacing="xs">
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  Created
                </Text>
                <Text size="sm">{formatDate(new Date(document.created_at))}</Text>
              </Stack>
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  File size
                </Text>
                <Text size="sm">{formatFileSize(document.file_size)}</Text>
              </Stack>
            </SimpleGrid>
          </Stack>

          <Tabs defaultValue="image">
            <Tabs.List grow>
              <Tabs.Tab value="image" leftSection={<IconEye size={14} />}>
                Document
              </Tabs.Tab>
              <Tabs.Tab value="text">OCR text</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="image" pt="md">
              {document.file_url ? (
                <Image src={document.file_url} radius="md" fallbackSrc="" alt={document.title} />
              ) : (
                <Alert
                  title="Original file unavailable"
                  color="yellow"
                  icon={<IconAlertCircle size={16} />}
                  variant="light"
                >
                  The backend does not yet expose the raw file stream. Add a download endpoint to preview the exact
                  image here.
                </Alert>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="text" pt="md">
              {isLoading ? (
                <Stack gap="sm">
                  <Skeleton height={18} />
                  <Skeleton height={18} />
                  <Skeleton height={18} width="80%" />
                </Stack>
              ) : isError ? (
                <Alert color="red" icon={<IconAlertCircle size={16} />}>
                  {error instanceof Error ? error.message : 'Failed to load OCR output'}
                </Alert>
              ) : ocrResult ? (
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text fw={600}>Extracted text</Text>
                    <CopyButton value={ocrResult.extracted_text ?? ''}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Copied' : 'Copy'}>
                          <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={copy}>
                            {copied ? 'Copied' : 'Copy text'}
                          </Button>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                  <ScrollArea h={260}>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {ocrResult.extracted_text || 'No text returned yet.'}
                    </Text>
                  </ScrollArea>
                </Stack>
              ) : (
                <Text c="dimmed">No OCR output recorded for this document.</Text>
              )}
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Drawer>
  );
}

