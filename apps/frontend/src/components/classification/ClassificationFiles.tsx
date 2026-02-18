import { Button, Group, Paper, Stack } from "@mantine/core";
import ClassificationFileCards from "./ClassificationFileCards";
import { useClassifier } from "@/data/hooks/useClassifier";

interface ClassificationFilesProps {
  groupId: string;
  name: string;
}

const ClassificationFiles = (props: ClassificationFilesProps) => {
  const { groupId, name } = props;
  const { getClassifierDocuments } = useClassifier();
  const docsQuery = getClassifierDocuments(groupId, name);

  // Transform API result into label/fileCount objects
  const files = (() => {
    const data = docsQuery.data || [];
    const labelCounts: Record<string, number> = {};
    data.forEach(item => {
      // If item ends with '/', it's a directory label
      if (item.endsWith('/')) {
        labelCounts[item.replace(/\/$/, '')] = 0;
      } else {
        // Extract directory name
        const match = item.match(/^([^/]+)\//);
        if (match) {
          const label = match[1];
          labelCounts[label] = (labelCounts[label] || 0) + 1;
        }
      }
    });
    return Object.entries(labelCounts).map(([label, fileCount]) => ({ label, fileCount }));
  })();

  return (
    <Stack>
      <Paper shadow="xs" radius="md" p="sm" withBorder>
        <Group justify="space-between" align="center" mb="md">
          <h2>Classification Files</h2>
          <Button variant="outline" size="xs" onClick={() => {/* handle add files */ }}>
            Add File Group
          </Button>
        </Group>
        {docsQuery.isLoading && <p>Loading files...</p>}
        {docsQuery.isError && <p style={{ color: 'red' }}>Error loading files</p>}
        <ClassificationFileCards files={files} />
      </Paper>
    </Stack>
  );
}

export default ClassificationFiles;