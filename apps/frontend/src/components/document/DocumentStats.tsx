import { Paper, SimpleGrid, Text } from "@mantine/core";
import { DocumentStatusCounts } from "@/data/hooks/useDocumentStats";

interface DocumentStatsProps {
  stats: DocumentStatusCounts | undefined;
}

const DocumentStats = (props: DocumentStatsProps) => {
  const { stats } = props;
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4, lg: 6 }}>
      <Paper radius="md" p="md" withBorder>
        <Text size="xs" c="dimmed">
          Total
        </Text>
        <Text fw={600} size="lg">
          {stats?.total ?? 0}
        </Text>
      </Paper>
      <Paper radius="md" p="md" withBorder>
        <Text size="xs" c="dimmed">
          Processing
        </Text>
        <Text fw={600} size="lg" c="yellow">
          {stats?.ongoing_ocr ?? 0}
        </Text>
      </Paper>
      <Paper radius="md" p="md" withBorder>
        <Text size="xs" c="dimmed">
          Extracted
        </Text>
        <Text fw={600} size="lg" c="blue">
          {stats?.extracted ?? 0}
        </Text>
      </Paper>
      <Paper radius="md" p="md" withBorder>
        <Text size="xs" c="dimmed">
          Awaiting review
        </Text>
        <Text fw={600} size="lg" c="orange">
          {stats?.awaiting_review ?? 0}
        </Text>
      </Paper>
      <Paper radius="md" p="md" withBorder>
        <Text size="xs" c="dimmed">
          Complete
        </Text>
        <Text fw={600} size="lg" c="green">
          {stats?.complete ?? 0}
        </Text>
      </Paper>
      <Paper radius="md" p="md" withBorder>
        <Text size="xs" c="dimmed">
          Failed
        </Text>
        <Text fw={600} size="lg" c="red">
          {(stats?.failed ?? 0) + (stats?.conversion_failed ?? 0)}
        </Text>
      </Paper>
    </SimpleGrid>
  );
};

export default DocumentStats;
