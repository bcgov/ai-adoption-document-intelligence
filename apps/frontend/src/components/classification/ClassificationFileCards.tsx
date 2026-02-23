import {
  ActionIcon,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconTrash, IconUpload } from "@tabler/icons-react";

interface ClassificationFileCardProps {
  label: string;
  fileCount: number;
}

interface ClassificationFileCardsProps {
  fileGroups: ClassificationFileCardProps[];
  onDelete: (label: string) => void;
  onUpload: (label: string) => void;
}

const ClassificationFileCards = ({
  fileGroups,
  onDelete,
  onUpload,
}: ClassificationFileCardsProps) => {
  return (
    <Stack gap="xs">
      <Grid>
        {fileGroups.map((file, idx) => (
          <Grid.Col key={file.label + idx} span={4}>
            <Paper
              key={file.label + idx}
              shadow="xs"
              radius="md"
              p="sm"
              withBorder
            >
              <Group justify="space-between" align="center">
                <Group gap="xs" align="center">
                  <Text size="sm" style={{ fontWeight: 500 }}>
                    {file.label}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {file.fileCount} file{file.fileCount === 1 ? "" : "s"}
                  </Text>
                </Group>
                <Group gap="xs">
                  <Tooltip label="Add files">
                    <ActionIcon
                      color="blue"
                      variant="light"
                      aria-label="Add files"
                      onClick={() => onUpload(file.label)}
                    >
                      <IconUpload size={18} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete files">
                    <ActionIcon
                      color="red"
                      variant="light"
                      aria-label="Delete files"
                      onClick={() => onDelete(file.label)}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          </Grid.Col>
        ))}
      </Grid>
    </Stack>
  );
};

export default ClassificationFileCards;
