import {
  Button,
  Card,
  Center,
  Code,
  Grid,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconFolder, IconPlus } from "@tabler/icons-react";
import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGroup } from "@/auth/GroupContext";
import { ModelCard } from "../components/ModelCard";
import { useTemplateModels } from "../hooks/useTemplateModels";

/**
 * Generates a slug preview from a display name.
 * This is a frontend-only preview -- the actual modelId is generated server-side.
 */
function generateModelIdPreview(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._~\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64);
}

export const ModelListPage: FC = () => {
  const navigate = useNavigate();
  const { templateModels, isLoading, createTemplateModel, isCreating } =
    useTemplateModels();
  const { activeGroup } = useGroup();
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelDescription, setNewModelDescription] = useState("");

  const modelIdPreview = generateModelIdPreview(newModelName);

  const handleCreateModel = () => {
    if (newModelName.trim()) {
      createTemplateModel({
        name: newModelName,
        description: newModelDescription || undefined,
      });
      setNewModelName("");
      setNewModelDescription("");
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
          <Title order={2}>Template Models</Title>
          <Text c="dimmed" size="sm">
            Create and manage template models for custom model training
          </Text>
        </Stack>
        <Tooltip
          label="A group must be selected to create a template model"
          disabled={!!activeGroup}
        >
          <span>
            <Button
              leftSection={<IconPlus size={18} />}
              disabled={!activeGroup}
              onClick={() => setCreateModalOpened(true)}
            >
              New Template Model
            </Button>
          </span>
        </Tooltip>
      </Group>

      {templateModels.length === 0 ? (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="md">
              <IconFolder size={48} stroke={1.5} color="gray" />
              <Stack gap={4} align="center">
                <Text fw={600}>No template models yet</Text>
                <Text size="sm" c="dimmed">
                  Create your first template model to get started
                </Text>
              </Stack>
              <Tooltip
                label="A group must be selected to create a template model"
                disabled={!!activeGroup}
              >
                <span>
                  <Button
                    leftSection={<IconPlus size={18} />}
                    disabled={!activeGroup}
                    onClick={() => setCreateModalOpened(true)}
                  >
                    Create Template Model
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Center>
        </Card>
      ) : (
        <Grid>
          {templateModels.map((model) => (
            <Grid.Col key={model.id} span={{ base: 12, md: 6, lg: 4 }}>
              <ModelCard
                model={model}
                onClick={() => navigate(`/template-models/${model.id}`)}
              />
            </Grid.Col>
          ))}
        </Grid>
      )}

      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        title="Create Template Model"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Enter template model name"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            required
          />
          {newModelName.trim() && modelIdPreview && (
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Model ID preview:
              </Text>
              <Code>{modelIdPreview}</Code>
            </Group>
          )}
          <Textarea
            label="Description"
            placeholder="Enter description (optional)"
            value={newModelDescription}
            onChange={(e) => setNewModelDescription(e.target.value)}
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
              onClick={handleCreateModel}
              loading={isCreating}
              disabled={!newModelName.trim()}
            >
              Create Template Model
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
