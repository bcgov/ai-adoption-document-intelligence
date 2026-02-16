import {
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconFolderOpen, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../hooks/useProjects";

export function ProjectListPage() {
  const { projects, isLoading } = useProjects();
  const navigate = useNavigate();
  const [createDialogOpened, setCreateDialogOpened] = useState(false);

  if (isLoading) {
    return (
      <Center h="70vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" data-testid="projects-header">
        <Stack gap={2}>
          <Title order={2}>Benchmark Projects</Title>
          <Text c="dimmed" size="sm">
            Organize benchmarks by project
          </Text>
        </Stack>
        <Button
          leftSection={<IconPlus size={18} />}
          onClick={() => setCreateDialogOpened(true)}
          data-testid="create-project-btn"
        >
          Create Project
        </Button>
      </Group>

      {projects.length === 0 ? (
        <Card withBorder p="xl" data-testid="projects-empty-state">
          <Center>
            <Stack align="center" gap="md">
              <IconFolderOpen size={48} stroke={1.5} color="gray" />
              <Stack gap={4} align="center">
                <Text fw={600}>No projects yet</Text>
                <Text size="sm" c="dimmed">
                  Create your first benchmark project to get started
                </Text>
              </Stack>
              <Button
                leftSection={<IconPlus size={18} />}
                onClick={() => setCreateDialogOpened(true)}
                data-testid="create-project-empty-btn"
              >
                Create Project
              </Button>
            </Stack>
          </Center>
        </Card>
      ) : (
        <Card withBorder p={0}>
          <Table striped highlightOnHover data-testid="projects-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Definitions</Table.Th>
                <Table.Th>Runs</Table.Th>
                <Table.Th>Created Date</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {projects.map((project) => (
                <Table.Tr
                  key={project.id}
                  onClick={() =>
                    navigate(`/benchmarking/projects/${project.id}`)
                  }
                  style={{ cursor: "pointer" }}
                  data-testid={`project-row-${project.id}`}
                >
                  <Table.Td>
                    <Text fw={600}>{project.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {project.description || "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{project.definitionCount || 0}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{project.runCount || 0}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* TODO: Add CreateProjectDialog component when needed */}
    </Stack>
  );
}
