/**
 * `DynamicNodesListPage` — `/dynamic-nodes` management view (Phase 6
 * US-180, Milestone F).
 *
 * Single Mantine `<Table>` of every non-deleted dynamic-node lineage
 * scoped to the calling group. Sourced from `useDynamicNodeList`
 * (`GET /api/dynamic-nodes`, US-176). Rows expose:
 *   - slug (clickable → `/dynamic-nodes/:slug`)
 *   - head version
 *   - last published (relative time)
 *   - versions count
 *   - used-in-N-workflows count
 *   - row actions: Edit (icon, navigates to edit) + Delete (icon, opens
 *     confirm modal → `useDynamicNodeDelete` → green notification +
 *     refetch)
 *
 * Empty state: centred "No custom nodes yet" + "+ Create your first"
 * CTA linking to `/dynamic-nodes/new`.
 * Loading: 5 Skeleton rows.
 * Error: red `<Alert>` with the message + a Retry button.
 */

import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type DynamicNodeListItem,
  useDynamicNodeDelete,
  useDynamicNodeList,
} from "../../features/workflow-builder/dynamic-nodes";

const SKELETON_ROWS = 5;

function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return iso;
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return seconds <= 1 ? "just now" : `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.round(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export default function DynamicNodesListPage() {
  const navigate = useNavigate();
  const listQuery = useDynamicNodeList();
  const deleteMutation = useDynamicNodeDelete();
  const [confirmTarget, setConfirmTarget] =
    useState<DynamicNodeListItem | null>(null);

  const handleDeleteClick = (item: DynamicNodeListItem) => {
    setConfirmTarget(item);
  };

  const handleDeleteCancel = () => {
    setConfirmTarget(null);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmTarget) return;
    try {
      await deleteMutation.mutateAsync(confirmTarget.slug);
      notifications.show({
        title: "Deleted",
        message: `Dynamic node "${confirmTarget.slug}" was soft-deleted.`,
        color: "green",
      });
      setConfirmTarget(null);
    } catch (err) {
      notifications.show({
        title: "Delete failed",
        message: err instanceof Error ? err.message : "Unknown error.",
        color: "red",
      });
    }
  };

  const topBar = (
    <Group justify="space-between">
      <Stack gap={2}>
        <Title order={2}>Dynamic nodes</Title>
        <Text c="dimmed" size="sm">
          Author and manage custom activities authored as TypeScript.
        </Text>
      </Stack>
      <Button
        leftSection={<IconPlus size={16} />}
        onClick={() => navigate("/dynamic-nodes/new")}
        data-testid="dynamic-nodes-list-new-btn"
      >
        New dynamic node
      </Button>
    </Group>
  );

  if (listQuery.isLoading) {
    return (
      <Stack gap="lg" data-testid="dynamic-nodes-list-loading">
        {topBar}
        <Card shadow="sm" radius="md" p="md" withBorder>
          <Stack gap="xs">
            {Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
              <Skeleton
                // Loading-state placeholders have no stable id; index is
                // intentional because the list is fixed-length and never
                // reorders.
                key={`skeleton-${idx}`}
                height={36}
                radius="sm"
              />
            ))}
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (listQuery.error) {
    return (
      <Stack gap="lg" data-testid="dynamic-nodes-list-error">
        {topBar}
        <Alert color="red" title="Failed to load dynamic nodes">
          <Stack gap="xs">
            <Text size="sm">{listQuery.error.message}</Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                onClick={() => listQuery.refetch()}
                data-testid="dynamic-nodes-list-retry"
              >
                Retry
              </Button>
            </Group>
          </Stack>
        </Alert>
      </Stack>
    );
  }

  const items = listQuery.data?.items ?? [];

  if (items.length === 0) {
    return (
      <Stack gap="lg" data-testid="dynamic-nodes-list-empty">
        {topBar}
        <Card shadow="sm" radius="md" p="xl" withBorder>
          <Stack align="center" gap="md">
            <Title order={4}>No custom nodes yet</Title>
            <Text c="dimmed" ta="center" size="sm">
              Author a custom TypeScript activity to use it like any built-in
              node.
            </Text>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => navigate("/dynamic-nodes/new")}
              data-testid="dynamic-nodes-list-empty-cta"
            >
              + Create your first
            </Button>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <>
      <Stack gap="lg" data-testid="dynamic-nodes-list-loaded">
        {topBar}
        <Card shadow="sm" radius="md" p="md" withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Slug</Table.Th>
                <Table.Th>Head version</Table.Th>
                <Table.Th>Last published</Table.Th>
                <Table.Th>Versions</Table.Th>
                <Table.Th>Used in workflows</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr
                  key={item.slug}
                  data-testid={`dynamic-nodes-list-row-${item.slug}`}
                >
                  <Table.Td>
                    <Anchor
                      component="button"
                      type="button"
                      onClick={() => navigate(`/dynamic-nodes/${item.slug}`)}
                      data-testid={`dynamic-nodes-list-slug-${item.slug}`}
                    >
                      <Text ff="monospace" fw={500}>
                        {item.slug}
                      </Text>
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue">
                      v{item.headVersion.versionNumber}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatRelativeTime(item.headVersion.publishedAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.versionCount}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.usedInWorkflowCount}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Edit dynamic node">
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={() =>
                            navigate(`/dynamic-nodes/${item.slug}`)
                          }
                          aria-label={`Edit ${item.slug}`}
                          data-testid={`dynamic-nodes-list-edit-${item.slug}`}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete dynamic node">
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => handleDeleteClick(item)}
                          loading={
                            deleteMutation.isPending &&
                            confirmTarget?.slug === item.slug
                          }
                          aria-label={`Delete ${item.slug}`}
                          data-testid={`dynamic-nodes-list-delete-${item.slug}`}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>

      <Modal
        opened={confirmTarget !== null}
        onClose={handleDeleteCancel}
        title="Delete dynamic node"
        centered
        data-testid="dynamic-nodes-list-delete-modal"
      >
        {confirmTarget && (
          <Stack gap="md">
            <Text>
              Delete <code>{confirmTarget.slug}</code>? Used in{" "}
              {confirmTarget.usedInWorkflowCount} workflow
              {confirmTarget.usedInWorkflowCount === 1 ? "" : "s"}. Workflows
              using this node will stop working until restored.
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button
                type="button"
                variant="subtle"
                onClick={handleDeleteCancel}
                data-testid="dynamic-nodes-list-delete-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                color="red"
                onClick={handleDeleteConfirm}
                loading={deleteMutation.isPending}
                data-testid="dynamic-nodes-list-delete-confirm"
              >
                Delete
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
