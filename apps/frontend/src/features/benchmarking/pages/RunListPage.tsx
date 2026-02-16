import { Alert, Button, Stack, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

export function RunListPage() {
  const navigate = useNavigate();

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>Benchmark Runs</Title>
        <Text c="dimmed" size="sm">
          View all benchmark runs across projects
        </Text>
      </Stack>

      <Alert
        icon={<IconInfoCircle size={18} />}
        title="Runs are organized by project"
        color="blue"
        data-testid="runs-info-alert"
      >
        <Stack gap="md">
          <Text size="sm">
            Benchmark runs are currently viewed within their respective project
            pages. Navigate to a project to view its runs, start new runs, and
            track progress.
          </Text>
          <Button
            variant="light"
            size="sm"
            onClick={() => navigate("/benchmarking/projects")}
            data-testid="view-projects-btn"
          >
            View Projects
          </Button>
        </Stack>
      </Alert>

      <Text c="dimmed" size="sm" data-testid="runs-placeholder-message">
        A unified runs view across all projects will be implemented in a future
        user story.
      </Text>
    </Stack>
  );
}
