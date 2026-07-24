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
import {
  Alert,
  Badge,
  Button,
  Code,
  ConfirmActionModal,
  CopyButton,
  Group,
  Modal,
  notifications,
  PageHeader,
  PanelCard,
  Paper,
  Stack,
  Text,
  Title,
} from "../ui";

export function SettingsPage() {
  const { activeGroup } = useGroup();
  const { data: apiKey, isLoading } = useApiKey();
  const generateMutation = useGenerateApiKey();
  const deleteMutation = useDeleteApiKey();
  const regenerateMutation = useRegenerateApiKey();

  const [newKey, setNewKey] = useState<GeneratedApiKey | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

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

  const handleDeleteKey = async (): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(apiKey!.id);
      notifications.show({
        title: "Success",
        message: "API key deleted successfully",
        color: "green",
      });
      return true;
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to delete API key",
        color: "red",
      });
      return false;
    }
  };

  const handleConfirmDeleteKey = async () => {
    const success = await handleDeleteKey();
    if (success) {
      setShowDeleteConfirmModal(false);
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
      <PageHeader
        title="Settings"
        description={
          activeGroup
            ? `Manage your API key for programmatic access — scoped to ${activeGroup.name}`
            : "Manage your API key for programmatic access"
        }
        showDateBadge={false}
        actions={
          <Badge variant="outline" size="lg">
            API configuration
          </Badge>
        }
      />

      <PanelCard>
        <Stack gap="md">
          <Group>
            <IconKey size={24} />
            <Title order={3}>API key</Title>
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
                      API key for {activeGroup?.name}
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
                  Regenerate key
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => setShowDeleteConfirmModal(true)}
                  loading={deleteMutation.isPending}
                >
                  Delete key
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
              Generate API key
            </Button>
          )}
        </Stack>
      </PanelCard>

      <PanelCard>
        <Stack gap="md">
          <Title order={3}>API usage</Title>
          <Text c="dimmed" size="sm">
            Use the following endpoint with your API key to upload documents:
          </Text>

          <Paper withBorder p="md" radius="sm" bg="gray.0">
            <Code block>
              {`curl -X POST ${backendUrl}/api/upload \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "title": "Document title",
    "file": "BASE64_ENCODED_FILE",
    "file_type": "image",
    "model_id": "prebuilt-layout"
  }'`}
            </Code>
          </Paper>
        </Stack>
      </PanelCard>

      <Modal
        opened={showKeyModal}
        onClose={closeKeyModal}
        title={`API key generated for ${activeGroup?.name}`}
        size="lg"
      >
        <Stack gap="md" align="flex-start">
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
                Your API key:
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
                      {copied ? "copied" : "copy"}
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

      <ConfirmActionModal
        opened={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleConfirmDeleteKey}
        title="Delete API key"
        message="Are you sure you want to delete this API key? Integrations using it will stop working until you generate a new key."
        confirmLabel="Delete key"
        confirmLoading={deleteMutation.isPending}
      />
    </Stack>
  );
}
