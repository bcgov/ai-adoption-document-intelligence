import {
  Button,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconFolder, IconPlus } from "@tabler/icons-react";
import { FC, useState } from "react";
import { ProjectCard } from "../components/ProjectCard";
import { useProjects } from "../hooks/useProjects";

interface ProjectListPageProps {
  onSelectProject?: (projectId: string) => void;
}

export const ProjectListPage: FC<ProjectListPageProps> = ({
  onSelectProject,
}) => {
  const { projects, isLoading, createProject, isCreating } = useProjects();
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      createProject({
        name: newProjectName,
        description: newProjectDescription || undefined,
      });
      setNewProjectName("");
      setNewProjectDescription("");
      setCreateModalOpened(false);
    }
  };

  if (isLoading) {
    return (
      <Center h="70vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Training Label Projects</Title>
          <Text c="dimmed" size="sm">
            Create and manage labeling projects for custom model training
          </Text>
        </Stack>
        <Button
          leftSection={<IconPlus size={18} />}
          onClick={() => setCreateModalOpened(true)}
        >
          New Project
        </Button>
      </Group>

      {projects.length === 0 ? (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="md">
              <IconFolder size={48} stroke={1.5} color="gray" />
              <Stack gap={4} align="center">
                <Text fw={600}>No projects yet</Text>
                <Text size="sm" c="dimmed">
                  Create your first labeling project to get started
                </Text>
              </Stack>
              <Button
                leftSection={<IconPlus size={18} />}
                onClick={() => setCreateModalOpened(true)}
              >
                Create Project
              </Button>
            </Stack>
          </Center>
        </Card>
      ) : (
        <Grid>
          {projects.map((project) => (
            <Grid.Col key={project.id} span={{ base: 12, md: 6, lg: 4 }}>
              <ProjectCard
                project={project}
                onClick={() => onSelectProject?.(project.id)}
              />
            </Grid.Col>
          ))}
        </Grid>
      )}

      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        title="Create New Project"
      >
        <Stack gap="md">
          <TextInput
            label="Project Name"
            placeholder="Enter project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            required
          />
          <Textarea
            label="Description"
            placeholder="Enter project description (optional)"
            value={newProjectDescription}
            onChange={(e) => setNewProjectDescription(e.target.value)}
            rows={3}
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => setCreateModalOpened(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              loading={isCreating}
              disabled={!newProjectName.trim()}
            >
              Create Project
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
