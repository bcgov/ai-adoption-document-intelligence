import { IconFolderOpen, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Center,
  DataTable,
  Loader,
  PageHeader,
  PanelCard,
  Stack,
  Text,
} from "../../../ui";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { useProjects } from "../hooks/useProjects";

export function ProjectListPage() {
  const {
    projects,
    isLoading,
    createProject,
    isCreating,
    createError,
    resetCreateError,
  } = useProjects();
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
      <PageHeader
        title="Benchmark projects"
        description="Organize benchmarks by project"
        actions={
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setCreateDialogOpened(true)}
            data-testid="create-project-btn"
          >
            Create project
          </Button>
        }
      />

      {projects.length === 0 ? (
        <PanelCard data-testid="projects-empty-state">
          <Stack p="md">
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
                  Create project
                </Button>
              </Stack>
            </Center>
          </Stack>
        </PanelCard>
      ) : (
        <PanelCard>
          <DataTable
            striped
            highlightOnHover
            data-testid="projects-table"
            caption={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
          >
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Name</DataTable.Th>
                <DataTable.Th>Description</DataTable.Th>
                <DataTable.Th>Definitions</DataTable.Th>
                <DataTable.Th>Runs</DataTable.Th>
                <DataTable.Th>Created date</DataTable.Th>
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {projects.map((project) => (
                <DataTable.Tr
                  key={project.id}
                  onClick={() =>
                    navigate(`/benchmarking/projects/${project.id}`)
                  }
                  style={{ cursor: "pointer" }}
                  data-testid={`project-row-${project.id}`}
                >
                  <DataTable.Td>
                    <Text fw={600}>{project.name}</Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {project.description || "—"}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm">{project.definitionCount || 0}</Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm">{project.runCount || 0}</Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </Text>
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        </PanelCard>
      )}

      <CreateProjectDialog
        opened={createDialogOpened}
        onClose={() => setCreateDialogOpened(false)}
        onCreate={(data) => createProject(data)}
        isCreating={isCreating}
        createError={createError}
        onResetError={resetCreateError}
      />
    </Stack>
  );
}
