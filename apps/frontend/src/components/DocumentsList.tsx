import React from 'react';
import { useDocuments } from '../data/hooks/useDocuments';
import { formatDate, formatFileSize } from '../shared/utils';
import type { Document } from '../shared/types';
import {
  Title,
  Text,
  Card,
  Badge,
  Alert,
  Loader,
  Grid,
  Stack,
  Group,
  Center
} from '@mantine/core';

export const DocumentsList: React.FC = () => {
  const { data: documents, isLoading, error } = useDocuments();

  if (isLoading) {
    return (
      <Center h={200}>
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Loading documents...</Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Alert variant="light" color="red" title="Error Loading Documents" icon="❌">
        {error.message}
      </Alert>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <Center h={200}>
        <Stack align="center" gap="sm">
          <Text size="lg" c="dimmed">📄</Text>
          <Text size="lg" c="dimmed">No documents found.</Text>
          <Text size="sm" c="dimmed">Upload some documents to get started.</Text>
        </Stack>
      </Center>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'processed':
        return 'green';
      case 'processing':
        return 'yellow';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getFileTypeColor = (fileType: string) => {
    if (fileType.includes('pdf')) return 'red';
    if (fileType.includes('image')) return 'blue';
    if (fileType.includes('text')) return 'green';
    return 'gray';
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Documents</Title>
        <Badge size="lg" variant="light" color="blue">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </Badge>
      </Group>

      <Grid gutter="md">
        {documents.map((document: Document) => (
          <Grid.Col key={document.id} span={{ base: 12, sm: 6, lg: 4 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Title order={4} lineClamp={2} style={{ flex: 1 }}>
                    {document.title}
                  </Title>
                  <Badge
                    color={getStatusColor(document.status)}
                    variant="light"
                    size="sm"
                  >
                    {document.status}
                  </Badge>
                </Group>

                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Filename:</Text>
                    <Text size="sm" lineClamp={1} style={{ maxWidth: '60%' }}>
                      {document.original_filename}
                    </Text>
                  </Group>

                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Type:</Text>
                    <Badge
                      color={getFileTypeColor(document.file_type)}
                      variant="dot"
                      size="sm"
                    >
                      {document.file_type}
                    </Badge>
                  </Group>

                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Size:</Text>
                    <Text size="sm">{formatFileSize(document.file_size)}</Text>
                  </Group>

                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Created:</Text>
                    <Text size="sm">{formatDate(new Date(document.created_at))}</Text>
                  </Group>

                  {document.source && (
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>Source:</Text>
                      <Text size="sm">{document.source}</Text>
                    </Group>
                  )}
                </Stack>
              </Stack>
            </Card>
          </Grid.Col>
        ))}
      </Grid>
    </Stack>
  );
};
