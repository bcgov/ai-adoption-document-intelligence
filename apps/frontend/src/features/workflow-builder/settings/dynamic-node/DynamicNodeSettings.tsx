/**
 * DynamicNodeSettings — right-rail body for `dyn.*` activity nodes (US-184).
 *
 * Layout:
 *   - Header: slug + description + DYN pill (or red "Deleted" pill + Alert
 *     when the lineage is missing from the merged catalog)
 *   - Version-pin row: `head` / `v{N}` badge + Change version Select +
 *     Edit script button (opens an in-situ modal mounting DynamicNodeEditor)
 *   - Parameters block: JsonSchemaForm against the version's paramsSchema
 *
 * Mirrors the Phase 2 Track 3 ChildWorkflowNodeSettings library version-pin
 * pattern.
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type {
  ActivityNode,
  GraphWorkflowConfig,
} from "../../../../types/workflow";
import { DynamicNodeEditor } from "../../dynamic-nodes/DynamicNodeEditor";
import { useActivityCatalog } from "../../dynamic-nodes/useActivityCatalog";
import { useDynamicNode } from "../../dynamic-nodes/useDynamicNode";
import { JsonSchemaForm } from "../../json-schema-form/JsonSchemaForm";
import type { JsonSchemaProperty } from "../../json-schema-form/types";

interface DynamicNodeSettingsProps {
  node: ActivityNode;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

export function DynamicNodeSettings({
  node,
  config,
  onConfigChange,
}: DynamicNodeSettingsProps) {
  const slug = node.activityType.replace(/^dyn\./, "");
  const catalog = useActivityCatalog();
  const catalogEntry = catalog.entries.find(
    (e) => e.activityType === node.activityType,
  );
  const detail = useDynamicNode(slug);

  const [editScriptOpen, setEditScriptOpen] = useState(false);

  const paramsSchema = useMemo<JsonSchemaProperty | undefined>(() => {
    return catalogEntry?.paramsSchema as JsonSchemaProperty | undefined;
  }, [catalogEntry]);

  const isDeleted = !catalog.isLoading && !catalogEntry;

  const pinnedVersion = node.dynamicNodeVersion;
  const versions = detail.data?.versions ?? [];
  const versionOptions = versions.map((v) => ({
    value: String(v.versionNumber),
    label: `v${v.versionNumber}`,
  }));

  const handleVersionChange = (value: string | null) => {
    const next: GraphWorkflowConfig = {
      ...config,
      nodes: {
        ...config.nodes,
        [node.id]:
          value === null
            ? { ...node, dynamicNodeVersion: undefined }
            : { ...node, dynamicNodeVersion: Number(value) },
      },
    };
    onConfigChange(next);
  };

  const handleParametersChange = (next: Record<string, unknown>) => {
    onConfigChange({
      ...config,
      nodes: {
        ...config.nodes,
        [node.id]: { ...node, parameters: next },
      },
    });
  };

  if (isDeleted) {
    return (
      <Stack gap="sm">
        <Group gap="xs">
          <Text fw={600}>{slug}</Text>
          <Badge size="xs" variant="filled" color="red">
            Deleted
          </Badge>
        </Group>
        <Alert
          color="red"
          icon={<IconAlertCircle size={16} />}
          data-testid="dynamic-node-settings-deleted-alert"
        >
          This dynamic node was deleted. Restore from the management page to use
          this node, or delete the node from this workflow.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text fw={600}>{slug}</Text>
        <Badge size="xs" variant="filled" color="grape">
          DYN
        </Badge>
      </Group>
      {catalogEntry?.description && (
        <Text size="xs" c="dimmed">
          {catalogEntry.description}
        </Text>
      )}

      <Group gap="sm" align="end">
        <Box>
          <Text size="xs" c="dimmed" mb={4}>
            Version
          </Text>
          <Select
            data-testid="dynamic-node-settings-version-select"
            value={pinnedVersion !== undefined ? String(pinnedVersion) : null}
            onChange={handleVersionChange}
            data={versionOptions}
            placeholder="head"
            clearable
            disabled={detail.isLoading}
            w={120}
          />
        </Box>
        <Badge
          variant={pinnedVersion !== undefined ? "filled" : "light"}
          color={pinnedVersion !== undefined ? "indigo" : "gray"}
        >
          {pinnedVersion !== undefined ? `v${pinnedVersion}` : "head"}
        </Badge>
        <Button
          variant="subtle"
          size="xs"
          data-testid="dynamic-node-settings-edit-script"
          onClick={() => setEditScriptOpen(true)}
        >
          Edit script
        </Button>
      </Group>

      {paramsSchema && (
        <Box>
          <Text size="xs" fw={600} mb={4}>
            Parameters
          </Text>
          <JsonSchemaForm
            schema={paramsSchema}
            value={(node.parameters ?? {}) as Record<string, unknown>}
            onChange={handleParametersChange}
          />
        </Box>
      )}

      {editScriptOpen && (
        <Modal
          opened
          onClose={() => setEditScriptOpen(false)}
          size="80%"
          title={`Edit ${slug}`}
          centered
        >
          <DynamicNodeEditor
            slug={slug}
            layout="modal"
            onAfterPublish={() => setEditScriptOpen(false)}
            onClose={() => setEditScriptOpen(false)}
          />
        </Modal>
      )}
    </Stack>
  );
}
