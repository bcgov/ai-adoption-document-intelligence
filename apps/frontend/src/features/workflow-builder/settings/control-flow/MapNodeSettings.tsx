/**
 * MapNodeSettings — map-specific body for the right-rail node-settings
 * panel.
 *
 * Edits the map-only fields of a fan-out `MapNode`:
 *   - `collectionCtxKey`, `itemCtxKey`, optional `indexCtxKey` —
 *     each a `VariablePicker` so the author binds to an existing ctx
 *     variable.
 *   - `maxConcurrency` — optional integer `NumberInput` (>= 1).
 *   - `bodyEntryNodeId` — a `NodePicker` restricted to node types that can
 *     actually run once per item (G-071); `bodyExitNodeId` — restricted to
 *     nodes reachable from the entry.
 *
 * The common header (label / type badge / delete) and footer
 * (input / output port bindings) live in the shared `NodeSettingsPanel`;
 * this component renders only the map-specific body.
 */

import { Alert, Box, NumberInput, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo } from "react";
import type { GraphWorkflowConfig, MapNode } from "../../../../types/workflow";
import { declareCtxKey, NodePicker, VariablePicker } from "../../graph-widgets";
import { replaceNode } from "../../replace-node";
import { analyzeMapBody, nodesReachableFrom } from "./map-body-analysis";

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
    onConfigChange(replaceNode(config, node.id, next));
  };

  const createCtxKey = (key: string) =>
    onConfigChange(declareCtxKey(config, key));

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

  /**
   * G-071 — the body-entry picker had no filter at all, so it offered node
   * types that cannot be a per-item entry:
   *   - `source` is the workflow's front door and has no upstream by
   *     definition; it runs once, at intake, not once per item;
   *   - `join` exists to collect a loop's results, so it can only follow one;
   *   - `humanGate` inside a body is refused outright (G-070) — offering it
   *     would be offering a guaranteed Save error.
   *
   * Nested loops stay on the list: a map inside a map is a legitimate shape
   * that `validateJoinScope` reasons about explicitly.
   */
  const entryCandidates = useMemo(
    () =>
      new Set(
        Object.entries(config.nodes)
          .filter(
            ([, n]) =>
              n.type !== "source" &&
              n.type !== "join" &&
              n.type !== "humanGate",
          )
          .map(([id]) => id),
      ),
    [config.nodes],
  );

  const entryId = node.bodyEntryNodeId || undefined;
  const exitId = node.bodyExitNodeId || undefined;
  // The exit must be reachable from the entry, so restrict the exit picker to
  // the entry's reachable set once an entry is chosen (no entry → no filter).
  const exitCandidates = entryId
    ? nodesReachableFrom(config, entryId)
    : undefined;
  const bodyAnalysis = analyzeMapBody(config, entryId, exitId);
  const deadEndLabels = bodyAnalysis.deadEndNodeIds.map(
    (id) => config.nodes[id]?.label || id,
  );

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
            onCreateCtxKey={createCtxKey}
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
            onCreateCtxKey={createCtxKey}
            label="Item ctx key"
            // D24 — "Why currentSegment? Is this what the node looks for, and
            // if it's always this, why do we specify it?" It is NOT fixed: the
            // field is free text and a fresh map node starts empty. What makes
            // `currentSegment` look mandatory is a real coupling elsewhere —
            // the `segment.<field>` shorthand in conditions is hard-wired to
            // read `ctx.currentSegment` — so the name is free but choosing a
            // different one silently costs you that shorthand. Both halves are
            // stated here rather than left to be discovered.
            description="Names the variable each iteration puts one item into, so steps inside the loop can read it. Any name works. Pick currentSegment to also use the segment.field shorthand in conditions — that shorthand always reads currentSegment, so under another name you write the full variable out."
            required
            data-testid="map-node-settings-item-ctx-key"
          />
          <VariablePicker
            config={config}
            currentNodeId={node.id}
            value={node.indexCtxKey ?? ""}
            onChange={setIndexCtxKey}
            onCreateCtxKey={createCtxKey}
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
            restrictToIds={entryCandidates}
            value={node.bodyEntryNodeId === "" ? null : node.bodyEntryNodeId}
            onChange={setBodyEntryNodeId}
            label="Body entry node"
            description="First node executed inside each iteration. Node types that cannot run per item are not listed."
            placeholder="Pick the entry node…"
            required
            data-testid="map-node-settings-body-entry"
          />
          <NodePicker
            config={config}
            currentNodeId={node.id}
            restrictToIds={exitCandidates}
            value={node.bodyExitNodeId === "" ? null : node.bodyExitNodeId}
            onChange={setBodyExitNodeId}
            label="Body exit node"
            description="Last node of each iteration; its output is collected by the matching Join. Every branch of the body must reach it."
            placeholder="Pick the exit node…"
            required
            data-testid="map-node-settings-body-exit"
          />

          {bodyAnalysis.computed && !bodyAnalysis.exitReachable ? (
            <Alert
              variant="light"
              color="red"
              icon={<IconAlertTriangle size={16} />}
              title="Body exit is unreachable"
              data-testid="map-body-exit-unreachable"
            >
              <Text size="xs">
                No path leads from the body-entry node to the exit. Every
                iteration must reach the exit node, or it will stall at runtime.
              </Text>
            </Alert>
          ) : bodyAnalysis.computed && deadEndLabels.length > 0 ? (
            <Alert
              variant="light"
              color="yellow"
              icon={<IconAlertTriangle size={16} />}
              title="Some branches never reach the exit"
              data-testid="map-body-deadend-warning"
            >
              <Text size="xs">
                These body branches end before the exit node:{" "}
                <strong>{deadEndLabels.join(", ")}</strong>. An iteration that
                follows one of them will stall at runtime, because the exit
                never completes. Make every branch lead to the exit node.
              </Text>
            </Alert>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}
