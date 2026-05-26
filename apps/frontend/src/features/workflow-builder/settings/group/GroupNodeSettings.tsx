/**
 * GroupNodeSettings — right-rail body for editing a `nodeGroups[<id>]`
 * entry (US-042 + US-044).
 *
 * Renders inputs for `label`, `description`, `icon`, and `color`, a
 * read-only list of member nodes with per-row remove buttons, the
 * `exposedParams[]` list editor (US-044), and a "Delete group" button at
 * the bottom (US-042 Scenario 5).
 *
 * Per US-042 Scenario 5, deleting the group removes ONLY `nodeGroups[<id>]`
 * — the underlying `nodes` + `edges` are untouched. Removing the last
 * member node of a group also drops the group entry (the underlying node
 * still stays).
 *
 * Per US-044 Scenario 5, removing a member node also prunes any
 * `exposedParams[i]` whose `nodeId` referenced the removed node and
 * surfaces the prune via a Mantine `notifications.show` toast so the
 * change is visible in the UI.
 */

import {
  ActionIcon,
  Box,
  Button,
  ColorInput,
  Divider,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTrash, IconX } from "@tabler/icons-react";
import { useMemo } from "react";
import type {
  ExposedParam,
  GraphWorkflowConfig,
  NodeGroup,
} from "../../../../types/workflow";
import { isSyntheticMapBodyGroupId } from "../../canvas/map-body-groups";
import { GROUP_ICON_KEYS, GROUP_ICONS } from "../../group/group-icons";
import { ExposedParamsEditor } from "./ExposedParamsEditor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GroupNodeSettingsProps {
  /** The group id being edited — keys into `config.nodeGroups`. */
  groupId: string;
  /** Full graph config (read for the group + member-node labels). */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodeGroups[groupId]` is updated, or
   * (Scenario 5) where the entry has been removed entirely.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroupNodeSettings({
  groupId,
  config,
  onConfigChange,
}: GroupNodeSettingsProps) {
  const group = config.nodeGroups?.[groupId];

  // Build icon picker option data once per render. `renderOption` is
  // used at the JSX level below to render the actual icon component
  // next to the key name.
  const iconOptions = useMemo(
    () => GROUP_ICON_KEYS.map((key) => ({ value: key, label: key })),
    [],
  );

  if (!group) {
    return (
      <Stack gap="xs" data-testid="group-node-settings" data-group-id={groupId}>
        <Text size="sm" c="dimmed">
          Group not found. It may have been deleted or renamed.
        </Text>
      </Stack>
    );
  }

  if (isSyntheticMapBodyGroupId(groupId)) {
    return (
      <Stack
        gap="md"
        data-testid="group-node-settings"
        data-group-id={groupId}
        p="md"
      >
        <Stack gap={4}>
          <Title order={5} m={0}>
            {group.label}
          </Title>
          <Text
            size="xs"
            c="dimmed"
            data-testid="group-settings-synthetic-banner"
          >
            This group reflects the body of a map node and updates
            automatically. It cannot be renamed or deleted.
          </Text>
        </Stack>
        <Divider />
        <Box data-testid="group-settings-node-list">
          <Text size="xs" fw={600} mb={4}>
            Members ({group.nodeIds.length})
          </Text>
          {group.nodeIds.length === 0 ? (
            <Text size="10px" c="dimmed">
              No nodes.
            </Text>
          ) : (
            <Stack gap={4}>
              {group.nodeIds.map((nodeId) => {
                const member = config.nodes[nodeId];
                const display = member?.label ?? nodeId;
                return (
                  <Text key={nodeId} size="xs">
                    {display}
                  </Text>
                );
              })}
            </Stack>
          )}
        </Box>
      </Stack>
    );
  }

  const updateGroup = (next: NodeGroup) => {
    const nextGroups = { ...(config.nodeGroups ?? {}), [groupId]: next };
    onConfigChange({ ...config, nodeGroups: nextGroups });
  };

  const deleteGroup = () => {
    const nextGroups = { ...(config.nodeGroups ?? {}) };
    delete nextGroups[groupId];
    onConfigChange({ ...config, nodeGroups: nextGroups });
  };

  const setLabel = (label: string) => updateGroup({ ...group, label });

  const setDescription = (description: string) => {
    if (description === "") {
      const next: NodeGroup = { ...group };
      delete next.description;
      updateGroup(next);
      return;
    }
    updateGroup({ ...group, description });
  };

  const setIcon = (icon: string | null) => {
    if (icon === null || icon === "") {
      const next: NodeGroup = { ...group };
      delete next.icon;
      updateGroup(next);
      return;
    }
    updateGroup({ ...group, icon });
  };

  const setColor = (color: string) => {
    if (color === "") {
      const next: NodeGroup = { ...group };
      delete next.color;
      updateGroup(next);
      return;
    }
    updateGroup({ ...group, color });
  };

  const removeNodeId = (nodeId: string) => {
    const remaining = group.nodeIds.filter((id) => id !== nodeId);
    if (remaining.length === 0) {
      // Removing the last node deletes the group entirely. Confirm with
      // the user so accidental misclicks don't drop the entry.
      // biome-ignore lint/suspicious/noAlert: native confirm matches existing UX patterns elsewhere in the editor for accidental-deletion guards.
      const confirmed = window.confirm(
        "Removing the last node will delete this group. Continue?",
      );
      if (!confirmed) return;
      deleteGroup();
      return;
    }
    // Prune any exposedParams whose `nodeId` references the removed node.
    // Per US-044 Scenario 5, the user is notified via a toast if any were
    // dropped so the change is visible.
    const existingParams: ExposedParam[] = group.exposedParams ?? [];
    const prunedParams = existingParams.filter(
      (param) => param.nodeId !== nodeId,
    );
    const droppedCount = existingParams.length - prunedParams.length;

    const next: NodeGroup = { ...group, nodeIds: remaining };
    if (group.exposedParams) {
      next.exposedParams = prunedParams;
    }
    updateGroup(next);

    if (droppedCount > 0) {
      const removedNode = config.nodes[nodeId];
      const removedLabel = removedNode?.label ? removedNode.label : nodeId;
      notifications.show({
        title: "Exposed parameter dropped",
        message: `${droppedCount} exposed param(s) referenced ${removedLabel}.`,
      });
    }
  };

  const setExposedParams = (nextParams: ExposedParam[]) => {
    updateGroup({ ...group, exposedParams: nextParams });
  };

  return (
    <Stack
      gap="md"
      data-testid="group-node-settings"
      data-group-id={groupId}
      p="md"
    >
      <Stack gap={4}>
        <Title order={5} m={0}>
          Group settings
        </Title>
        <Text size="xs" c="dimmed">
          Edit the label, icon, and colour. Members are listed below.
        </Text>
      </Stack>

      <Divider />

      <TextInput
        label="Label"
        description="Shown on the group chip in simplified view."
        value={group.label}
        onChange={(e) => setLabel(e.currentTarget.value)}
        size="xs"
        withAsterisk
        data-testid="group-settings-label"
      />

      <Textarea
        label="Description"
        description="Optional. Surfaced as a sub-line on the group chip."
        value={group.description ?? ""}
        onChange={(e) => setDescription(e.currentTarget.value)}
        size="xs"
        autosize
        minRows={2}
        data-testid="group-settings-description"
      />

      <Select
        label="Icon"
        description="Choose a glyph for the group chip."
        data={iconOptions}
        value={group.icon ?? null}
        onChange={(value) => setIcon(value)}
        searchable
        clearable
        size="xs"
        data-testid="group-settings-icon"
        renderOption={({ option }) => {
          const Icon = GROUP_ICONS[option.value];
          return (
            <Group gap={8} wrap="nowrap">
              {Icon ? <Icon size={16} /> : null}
              <Text size="xs">{option.label}</Text>
            </Group>
          );
        }}
      />

      <ColorInput
        label="Color"
        description="Used for the group's border and chip accent."
        value={group.color ?? ""}
        onChange={setColor}
        size="xs"
        format="hex"
        swatches={[
          "#3b82f6",
          "#10b981",
          "#ef4444",
          "#f59e0b",
          "#8b5cf6",
          "#f97316",
          "#6b7280",
        ]}
        data-testid="group-settings-color"
      />

      <Divider />

      <Box data-testid="group-settings-node-list">
        <Text size="xs" fw={600} mb={4}>
          Members ({group.nodeIds.length})
        </Text>
        {group.nodeIds.length === 0 ? (
          <Text size="10px" c="dimmed">
            No nodes.
          </Text>
        ) : (
          <Stack gap={4}>
            {group.nodeIds.map((nodeId) => {
              const member = config.nodes[nodeId];
              const display = member?.label ?? nodeId;
              return (
                <Group
                  key={nodeId}
                  gap="xs"
                  wrap="nowrap"
                  justify="space-between"
                >
                  <Text
                    size="xs"
                    style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {display}
                  </Text>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => removeNodeId(nodeId)}
                    aria-label={`Remove ${display} from group`}
                    data-testid={`group-settings-remove-node-${nodeId}`}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              );
            })}
          </Stack>
        )}
      </Box>

      <Divider />

      <Box>
        <Text size="xs" fw={600} mb={4}>
          Exposed parameters
        </Text>
        <ExposedParamsEditor
          value={group.exposedParams ?? []}
          nodeIds={group.nodeIds}
          config={config}
          onChange={setExposedParams}
        />
      </Box>

      <Divider />

      <Button
        color="red"
        variant="light"
        leftSection={<IconTrash size={14} />}
        onClick={deleteGroup}
        size="xs"
        data-testid="group-settings-delete"
      >
        Delete group
      </Button>
    </Stack>
  );
}
