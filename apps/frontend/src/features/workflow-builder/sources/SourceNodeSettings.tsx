/**
 * SourceNodeSettings — source-specific body for the right-rail node-settings
 * panel (US-119).
 *
 * Renders a header (catalog displayName + description + Tabler icon + optional
 * label override subtitle) and the catalog entry's `parametersSchema`-driven
 * form body. Mirrors the activity-node settings parity: the same
 * `JsonSchemaForm` walks the JSON Schema produced by `z.toJSONSchema()`, so
 * the form widgets and x-widget dispatch (including the forthcoming
 * `field-list-editor` for `source.api` in US-120) come for free.
 *
 * The shared header chrome (label TextInput, type badge, delete button) and
 * the shared port-bindings footer still live in `NodeSettingsPanel`; this
 * component renders only the source-specific middle band.
 *
 * For `source.upload` nodes the `SourceUploadButton` (US-124) is
 * mounted below the parameters form so authors can verify the
 * upload constraints without opening the Run drawer.
 */

import {
  getSourceCatalogEntry,
  getSourceParametersJsonSchema,
  type SourceNode,
} from "@ai-di/graph-workflow";
import { Box, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { useMemo } from "react";

import type { GraphWorkflowConfig } from "../../../types/workflow";
import { JsonSchemaForm, type JsonSchemaProperty } from "../json-schema-form";
import { SourceUploadButton } from "./SourceUploadButton";
import { resolveSourceColor, resolveSourceIcon } from "./source-catalog-utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SourceNodeSettingsProps {
  /** The narrowed source node being edited. */
  node: SourceNode;
  /** Full graph config — used for the standard mutation contract. */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodes[node.id]` is the updated
   * `SourceNode`. Matches the mutation contract used by `NodeSettingsPanel`
   * for activity and control-flow nodes today.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
  /**
   * Lineage id of the workflow being edited, when in edit mode.
   * `undefined` in create mode — the `SourceUploadButton` (US-124)
   * renders disabled with a "Save the workflow first" tooltip in
   * that case.
   */
  workflowId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SourceNodeSettings({
  node,
  config,
  onConfigChange,
  workflowId,
}: SourceNodeSettingsProps) {
  const entry = getSourceCatalogEntry(node.sourceType);

  // Memoise the JSON Schema conversion so we don't re-run the catalog
  // helper on every render — keyed off `sourceType` (catalog entries
  // are frozen at module load).
  //
  // The conversion has to happen inside `@ai-di/graph-workflow` (via
  // `getSourceParametersJsonSchema`) rather than calling
  // `z.toJSONSchema(entry.parametersSchema)` here — otherwise the
  // frontend's zod instance can't see the `.meta(...)` registry that
  // the catalog's zod instance populated at import time, and form
  // fields lose their `title` / `description` / `x-widget` hints.
  const paramsSchema = useMemo<JsonSchemaProperty | undefined>(() => {
    const schema = getSourceParametersJsonSchema(node.sourceType);
    return schema as JsonSchemaProperty | undefined;
  }, [node.sourceType]);

  const validation = useMemo(() => {
    if (!entry) return null;
    return entry.parametersSchema.safeParse(node.parameters ?? {});
  }, [entry, node.parameters]);

  /**
   * Effective `source.upload` parameters with the catalog's zod
   * `.default(...)` values applied — used to wire the "Test upload"
   * button's `accept` attribute to the resolved allowedMimeTypes
   * even when the user hasn't customised the field.
   *
   * `source.api` (and any other future source subtype) returns
   * `null` here; the button only renders for `source.upload`.
   */
  const uploadAllowedMimeTypes = useMemo<string[] | null>(() => {
    if (node.sourceType !== "source.upload" || !entry) return null;
    const parsed = entry.parametersSchema.safeParse(node.parameters ?? {});
    if (!parsed.success) {
      // Fall back to the design-doc defaults so the button stays
      // usable even when the form is in an intermediate invalid
      // state — the backend will re-validate per-file anyway.
      return ["application/pdf", "image/*"];
    }
    const raw = (parsed.data as { allowedMimeTypes?: unknown })
      .allowedMimeTypes;
    if (
      Array.isArray(raw) &&
      raw.every((entry): entry is string => typeof entry === "string")
    ) {
      return raw;
    }
    return ["application/pdf", "image/*"];
  }, [entry, node.parameters, node.sourceType]);

  const setParameters = (parameters: Record<string, unknown>) => {
    const updated: SourceNode = { ...node, parameters };
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: updated },
    });
  };

  if (!entry) {
    return (
      <Box data-testid="source-node-settings">
        <Text c="red" size="sm" data-testid="source-node-settings-unknown">
          Unknown source type: {node.sourceType}
        </Text>
      </Box>
    );
  }

  const Icon = resolveSourceIcon(entry.iconHint);
  const iconColor = resolveSourceColor(entry.colorHint);

  const showLabelOverride =
    node.label.length > 0 && node.label !== entry.displayName;

  return (
    <Box data-testid="source-node-settings">
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          {Icon && (
            <ThemeIcon
              variant="light"
              color={entry.colorHint}
              data-testid="source-node-settings-icon"
              style={iconColor ? { color: iconColor } : undefined}
            >
              <Icon size={18} />
            </ThemeIcon>
          )}
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text
              fw={600}
              size="sm"
              data-testid="source-node-settings-display-name"
            >
              {entry.displayName}
            </Text>
            <Text size="xs" c="dimmed">
              {entry.description}
            </Text>
            {showLabelOverride && (
              <Text
                size="xs"
                c="dimmed"
                data-testid="source-node-settings-label-override"
              >
                Label: {node.label}
              </Text>
            )}
          </Stack>
        </Group>

        <Box>
          <Text size="xs" fw={600} mb={4}>
            Parameters
          </Text>
          <JsonSchemaForm
            schema={paramsSchema}
            value={node.parameters ?? {}}
            onChange={setParameters}
          />
          {validation && !validation.success && (
            <Text
              size="10px"
              c="red"
              mt={6}
              data-testid="source-node-settings-validation-issues"
            >
              {validation.error.issues.length} validation issue
              {validation.error.issues.length === 1 ? "" : "s"}
            </Text>
          )}
        </Box>

        {node.sourceType === "source.upload" && uploadAllowedMimeTypes && (
          <SourceUploadButton
            workflowId={workflowId}
            sourceNodeId={node.id}
            allowedMimeTypes={uploadAllowedMimeTypes}
          />
        )}
      </Stack>
    </Box>
  );
}
