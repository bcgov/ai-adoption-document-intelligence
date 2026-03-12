import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconKey,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useGroup } from "../auth/GroupContext";
import {
  GeneratedApiKey,
  useApiKey,
  useDeleteApiKey,
  useGenerateApiKey,
  useRegenerateApiKey,
} from "../data/hooks/useApiKey";

export function SettingsPage() {
  const { activeGroup } = useGroup();
  const { data: apiKey, isLoading } = useApiKey();
  const generateMutation = useGenerateApiKey();
  const deleteMutation = useDeleteApiKey();
  const regenerateMutation = useRegenerateApiKey();

  const [newKey, setNewKey] = useState<GeneratedApiKey | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  const handleGenerateKey = async () => {
    try {
      const result = await generateMutation.mutateAsync();
      setNewKey(result);
      setShowKeyModal(true);
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to generate API key",
        color: "red",
      });
    }
  };

  const handleRegenerateKey = async () => {
    try {
      const result = await regenerateMutation.mutateAsync(apiKey!.id);
      setNewKey(result);
      setShowKeyModal(true);
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to regenerate API key",
        color: "red",
      });
    }
  };

  const handleDeleteKey = async () => {
    try {
      await deleteMutation.mutateAsync(apiKey!.id);
      notifications.show({
        title: "Success",
        message: "API key deleted successfully",
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to delete API key",
        color: "red",
      });
    }
  };

  const closeKeyModal = () => {
    setShowKeyModal(false);
    setNewKey(null);
  };

  const backendUrl =
    window.location.origin.replace(":3000", ":3002") || "http://localhost:3002";

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Settings</Title>
          <Text c="dimmed" size="sm">
            Manage your API key for programmatic access
            {activeGroup && (
              <>
                {" "}
                — currently scoped to the group{" "}
                <strong>{activeGroup.name}</strong>
              </>
            )}
          </Text>
        </Stack>
        <Badge variant="outline" size="lg">
          API Configuration
        </Badge>
      </Group>

      <Paper shadow="sm" radius="md" p="lg" withBorder>
        <Stack gap="md">
          <Group>
            <IconKey size={24} />
            <Title order={3}>API Key</Title>
          </Group>

          <Text c="dimmed" size="sm">
            Use an API key to upload documents programmatically without browser
            authentication. Each group can have one API key at a time.
          </Text>

          {isLoading ? (
            <Text c="dimmed">Loading...</Text>
          ) : apiKey ? (
            <Stack gap="md">
              <Paper withBorder p="md" radius="sm">
                <Group justify="space-between">
                  <Stack gap={4}>
                    <Text size="sm" fw={600}>
                      API Key for {activeGroup?.name}
                    </Text>
                    <Group gap="xs">
                      <Code>{apiKey.keyPrefix}...</Code>
                      <Badge size="sm" variant="light">
                        Active
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Created: {new Date(apiKey.createdAt).toLocaleDateString()}
                      {apiKey.lastUsed && (
                        <>
                          {" "}
                          • Last used:{" "}
                          {new Date(apiKey.lastUsed).toLocaleDateString()}
                        </>
                      )}
                    </Text>
                  </Stack>
                </Group>
              </Paper>

              <Group>
                <Button
                  variant="outline"
                  color="blue"
                  leftSection={<IconKey size={16} />}
                  onClick={handleRegenerateKey}
                  loading={regenerateMutation.isPending}
                >
                  Regenerate Key
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={handleDeleteKey}
                  loading={deleteMutation.isPending}
                >
                  Delete Key
                </Button>
              </Group>
            </Stack>
          ) : (
            <Button
              leftSection={<IconKey size={16} />}
              onClick={handleGenerateKey}
              loading={generateMutation.isPending}
              disabled={!activeGroup}
            >
              Generate API Key
            </Button>
          )}
        </Stack>
      </Paper>

      <Paper shadow="sm" radius="md" p="lg" withBorder>
        <Stack gap="md">
          <Title order={3}>API Usage</Title>
          <Text c="dimmed" size="sm">
            Use the following endpoint with your API key to upload documents:
          </Text>

          <Paper withBorder p="md" radius="sm" bg="gray.0">
            <Code block>
              {`curl -X POST ${backendUrl}/api/upload \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "title": "Document Title",
    "file": "BASE64_ENCODED_FILE",
    "file_type": "image",
    "model_id": "prebuilt-layout"
  }'`}
            </Code>
          </Paper>
        </Stack>
      </Paper>

      <Modal
        opened={showKeyModal}
        onClose={closeKeyModal}
        title={`API Key Generated for ${activeGroup?.name}`}
        size="lg"
      >
        <Stack gap="md">
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Important"
            color="yellow"
          >
            This is the only time you will see this key. Copy it now and store
            it securely.
          </Alert>

          <Paper withBorder p="md" radius="sm">
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Your API Key:
              </Text>
              <Group gap="xs">
                <Code style={{ flex: 1, wordBreak: "break-all" }}>
                  {newKey?.key}
                </Code>
                <CopyButton value={newKey?.key || ""}>
                  {({ copied, copy }) => (
                    <Button
                      color={copied ? "teal" : "blue"}
                      onClick={copy}
                      leftSection={
                        copied ? (
                          <IconCheck size={16} />
                        ) : (
                          <IconCopy size={16} />
                        )
                      }
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Paper>

          <Button onClick={closeKeyModal} fullWidth>
            I have copied my key
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
