/**
 * MapNodeSettings — map-specific body for the right-rail node-settings
 * panel.
 *
 * Edits the map-only fields of a fan-out `MapNode`:
 *   - `collectionCtxKey`, `itemCtxKey`, optional `indexCtxKey` —
 *     each a `VariablePicker` so the author binds to an existing ctx
 *     variable.
 *   - `maxConcurrency` — optional integer `NumberInput` (>= 1).
 *   - `bodyEntryNodeId`, `bodyExitNodeId` — each a `NodePicker` over
 *     all nodes (no `filterType`).
 *
 * The common header (label / type badge / delete) and footer
 * (input / output port bindings) live in the shared `NodeSettingsPanel`;
 * this component renders only the map-specific body.
 */

import { Box, NumberInput, Stack, Title } from "@mantine/core";
import type { GraphWorkflowConfig, MapNode } from "../../../../types/workflow";
import { NodePicker, VariablePicker } from "../../graph-widgets";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MapNodeSettingsProps {
  /** The narrowed map node being edited. */
  node: MapNode;
  /** Full graph config — used for the nested pickers' option sources. */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodes[node.id]` is the updated
   * `MapNode`. Matches the mutation contract used by `NodeSettingsPanel`
   * for activity nodes today.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MapNodeSettings({
  node,
  config,
  onConfigChange,
}: MapNodeSettingsProps) {
  const updateNode = (next: MapNode) => {
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: next },
    });
  };

  const setCollectionCtxKey = (next: string) =>
    updateNode({ ...node, collectionCtxKey: next });

  const setItemCtxKey = (next: string) =>
    updateNode({ ...node, itemCtxKey: next });

  const setIndexCtxKey = (next: string) => {
    if (next === "") {
      const cleared: MapNode = { ...node };
      delete cleared.indexCtxKey;
      updateNode(cleared);
      return;
    }
    updateNode({ ...node, indexCtxKey: next });
  };

  const setMaxConcurrency = (next: number | string) => {
    // Mantine NumberInput emits "" when cleared, or a number otherwise.
    if (next === "" || next === null || next === undefined) {
      const cleared: MapNode = { ...node };
      delete cleared.maxConcurrency;
      updateNode(cleared);
      return;
    }
    if (typeof next !== "number" || !Number.isFinite(next)) {
      return;
    }
    // Belt-and-braces: NumberInput's min / allowDecimal props already
    // reject these in the browser, but enforce here so JSON round-trip
    // can never carry a sub-1 or fractional maxConcurrency.
    if (next < 1 || !Number.isInteger(next)) {
      return;
    }
    updateNode({ ...node, maxConcurrency: next });
  };

  const setBodyEntryNodeId = (next: string | null) =>
    updateNode({ ...node, bodyEntryNodeId: next ?? "" });

  const setBodyExitNodeId = (next: string | null) =>
    updateNode({ ...node, bodyExitNodeId: next ?? "" });

  return (
    <Stack gap="md" data-testid="map-node-settings" data-node-id={node.id}>
      <Box>
        <Title order={5} mb="xs">
          Iteration
        </Title>
        <Stack gap="xs">
          <VariablePicker
            config={config}
            currentNodeId={node.id}
            value={node.collectionCtxKey}
            onChange={setCollectionCtxKey}
            label="Collection ctx key"
            description="The ctx variable holding the collection to fan out over."
            required
            data-testid="map-node-settings-collection-ctx-key"
          />
          <VariablePicker
            config={config}
            currentNodeId={node.id}
            value={node.itemCtxKey}
            onChange={setItemCtxKey}
            label="Item ctx key"
            description="ctx key bound to the current item inside each iteration."
            required
            data-testid="map-node-settings-item-ctx-key"
          />
          <VariablePicker
            config={config}
            currentNodeId={node.id}
            value={node.indexCtxKey ?? ""}
            onChange={setIndexCtxKey}
            label="Index ctx key (optional)"
            description="If set, the current 0-based index is written to this ctx key."
            data-testid="map-node-settings-index-ctx-key"
          />
          <NumberInput
            label="Max concurrency (optional)"
            description="Upper bound on parallel iterations. Leave empty for the engine default."
            placeholder="e.g. 4"
            size="xs"
            min={1}
            step={1}
            allowDecimal={false}
            allowNegative={false}
            value={node.maxConcurrency ?? ""}
            onChange={setMaxConcurrency}
            data-testid="map-node-settings-max-concurrency"
          />
        </Stack>
      </Box>

      <Box>
        <Title order={5} mb="xs">
          Body
        </Title>
        <Stack gap="xs">
          <NodePicker
            config={config}
            currentNodeId={node.id}
            value={node.bodyEntryNodeId === "" ? null : node.bodyEntryNodeId}
            onChange={setBodyEntryNodeId}
            label="Body entry node"
            description="First node executed inside each iteration."
            placeholder="Pick the entry node…"
            required
            data-testid="map-node-settings-body-entry"
          />
          <NodePicker
            config={config}
            currentNodeId={node.id}
            value={node.bodyExitNodeId === "" ? null : node.bodyExitNodeId}
            onChange={setBodyExitNodeId}
            label="Body exit node"
            description="Last node of each iteration; its output is collected by the matching Join."
            placeholder="Pick the exit node…"
            required
            data-testid="map-node-settings-body-exit"
          />
        </Stack>
      </Box>
    </Stack>
  );
}
