import { Button, Group, Paper, Stack } from "@mantine/core";
import ClassificationFileCards from "./ClassificationFileCards";

const ClassificationFiles = () => {
  // Example data, replace with real data as needed
  const files = [
    { label: "Invoices", fileCount: 12 },
    { label: "Receipts", fileCount: 3 },
    { label: "Contracts", fileCount: 7 },
  ];

  return (
    <Stack>
      <Paper shadow="xs" radius="md" p="sm" withBorder>
        <Group justify="space-between" align="center" mb="md">
          <h2>Classification Files</h2>
          <Button variant="outline" size="xs" onClick={() => {/* handle add files */ }}>
            Add File Group
          </Button>
        </Group>
      <ClassificationFileCards files={files} />
      </Paper>
    </Stack>
  );
}

export default ClassificationFiles;