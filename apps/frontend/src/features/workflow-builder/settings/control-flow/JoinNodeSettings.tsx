/**
 * JoinNodeSettings — join-specific body for the right-rail node-settings
 * panel.
 *
 * Edits the three join-only fields of a fan-in `JoinNode`:
 *   - `sourceMapNodeId` — `NodePicker` filtered to nodes whose
 *     `type === "map"` (so a Join can only reference its matching Map).
 *   - `resultsCtxKey` — `VariablePicker` so the author binds the join's
 *     aggregated results to an existing ctx variable.
 *
 * The common header (label / type badge / delete) and footer (input /
 * output port bindings) live in the shared `NodeSettingsPanel`; this
 * component renders only the join-specific body.
 */

import { Box, Stack, Title } from "@mantine/core";
import type { GraphWorkflowConfig, JoinNode } from "../../../../types/workflow";
import { NodePicker, VariablePicker } from "../../graph-widgets";
import { replaceNode } from "../../replace-node";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JoinNodeSettingsProps {
  /** The narrowed join node being edited. */
  node: JoinNode;
  /** Full graph config — used for the nested pickers' option sources. */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodes[node.id]` is the updated
   * `JoinNode`. Matches the mutation contract used by `NodeSettingsPanel`
   * for activity nodes today.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JoinNodeSettings({
  node,
  config,
  onConfigChange,
}: JoinNodeSettingsProps) {
  const updateNode = (next: JoinNode) => {
    onConfigChange(replaceNode(config, node.id, next));
  };

  const setSourceMapNodeId = (next: string | null) =>
    updateNode({ ...node, sourceMapNodeId: next ?? "" });

  const setResultsCtxKey = (next: string) =>
    updateNode({ ...node, resultsCtxKey: next });

  return (
    <Stack gap="md" data-testid="join-node-settings" data-node-id={node.id}>
      <Box>
        <Title order={5} mb="xs">
          Source
        </Title>
        <NodePicker
          config={config}
          currentNodeId={node.id}
          filterType="map"
          value={node.sourceMapNodeId === "" ? null : node.sourceMapNodeId}
          onChange={setSourceMapNodeId}
          label="Source Map node"
          description="The Map node whose fan-out iterations this Join collects."
          placeholder="Pick a Map node…"
          required
          data-testid="join-node-settings-source-map-node-id"
        />
      </Box>

      <Box>
        <Title order={5} mb="xs">
          Results
        </Title>
        <VariablePicker
          config={config}
          currentNodeId={node.id}
          value={node.resultsCtxKey}
          onChange={setResultsCtxKey}
          label="Results ctx key"
          description="ctx key the aggregated iteration results are written to."
          required
          data-testid="join-node-settings-results-ctx-key"
        />
      </Box>
    </Stack>
  );
}
