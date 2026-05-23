/**
 * HumanGateNodeSettings — humanGate-specific body for the right-rail
 * node-settings panel.
 *
 * Edits the humanGate-only fields of a `HumanGateNode`:
 *   - `signal.name` — `TextInput`, required. An inline error appears when
 *     the value is empty.
 *   - `signal.payloadSchema` — read-only JSON preview with an "advanced"
 *     hint. Schema authoring is out of scope for V2.
 *   - `timeout` — `TextInput` validated as a Temporal duration string,
 *     required. Invalid drafts surface an inline error and are not
 *     propagated through `onConfigChange`.
 *   - `onTimeout` — `SegmentedControl` with `fail` / `continue` /
 *     `fallback`.
 *   - `fallbackEdgeId` — `EdgePicker` (FR-1b) scoped to edges originating
 *     from this node. Only rendered when `onTimeout === "fallback"`.
 *     Switching `onTimeout` away from `fallback` drops the field from the
 *     emitted node so the JSON stays clean.
 *
 * The common header (label / type badge / delete) and footer
 * (input / output port bindings) live in the shared `NodeSettingsPanel`;
 * this component renders only the humanGate-specific body.
 */

import {
  Box,
  Code,
  Divider,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import type {
  GraphWorkflowConfig,
  HumanGateNode,
} from "../../../../types/workflow";
import { EdgePicker } from "../../graph-widgets";
import {
  isValidTemporalDuration,
  TEMPORAL_DURATION_HELP_TEXT,
} from "./duration-validation";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HumanGateNodeSettingsProps {
  /** The narrowed humanGate node being edited. */
  node: HumanGateNode;
  /** Full graph config — used for the `EdgePicker` options. */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodes[node.id]` is the updated
   * `HumanGateNode`. Matches the mutation contract used by
   * `NodeSettingsPanel` for activity nodes today.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

// ---------------------------------------------------------------------------
// On-timeout options
// ---------------------------------------------------------------------------

const ON_TIMEOUT_OPTIONS: Array<{
  value: HumanGateNode["onTimeout"];
  label: string;
}> = [
  { value: "fail", label: "Fail" },
  { value: "continue", label: "Continue" },
  { value: "fallback", label: "Fallback" },
];

function isOnTimeoutValue(value: string): value is HumanGateNode["onTimeout"] {
  return value === "fail" || value === "continue" || value === "fallback";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HumanGateNodeSettings({
  node,
  config,
  onConfigChange,
}: HumanGateNodeSettingsProps) {
  const updateNode = (next: HumanGateNode) => {
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: next },
    });
  };

  // ── signal.name (required TextInput) ───────────────────────────────────
  const signalNameError =
    node.signal.name.length === 0 ? "Signal name is required." : null;

  const setSignalName = (raw: string) => {
    if (raw === node.signal.name) return;
    updateNode({
      ...node,
      signal: { ...node.signal, name: raw },
    });
  };

  // ── timeout (required Temporal duration) ───────────────────────────────
  // Mirror the PollUntilNodeSettings pattern: keep a local draft so the
  // user can type invalid values briefly with an inline error, without
  // propagating broken values into the graph config.
  const [timeoutDraft, setTimeoutDraft] = useState(node.timeout);
  useEffect(() => {
    setTimeoutDraft(node.timeout);
  }, [node.timeout]);

  const timeoutDraftValid = isValidTemporalDuration(timeoutDraft);
  const timeoutError =
    !timeoutDraftValid && timeoutDraft.length > 0
      ? "Enter a Temporal duration like 30s, 5m, 1h."
      : timeoutDraft.length === 0
        ? "Timeout is required."
        : null;

  const commitTimeout = (raw: string) => {
    setTimeoutDraft(raw);
    if (!isValidTemporalDuration(raw)) return;
    if (raw === node.timeout) return;
    updateNode({ ...node, timeout: raw });
  };

  // ── onTimeout (SegmentedControl) ───────────────────────────────────────
  const setOnTimeout = (next: string) => {
    // SegmentedControl's data is locked to the onTimeout literal union,
    // but its onChange signature is `(value: string) => void`. Narrow back
    // before forwarding so the rest of the form keeps the strict union.
    if (!isOnTimeoutValue(next)) return;
    if (next === node.onTimeout) return;
    if (next === "fallback") {
      updateNode({ ...node, onTimeout: next });
      return;
    }
    // Switching away from `fallback` drops `fallbackEdgeId` from the
    // emitted node so the JSON stays clean — match the SwitchNodeSettings
    // "delete on clear" pattern.
    const cleared: HumanGateNode = { ...node, onTimeout: next };
    delete cleared.fallbackEdgeId;
    updateNode(cleared);
  };

  // ── fallbackEdgeId (EdgePicker, conditional) ───────────────────────────
  const setFallbackEdgeId = (edgeId: string | null) => {
    if (edgeId === null) {
      const cleared: HumanGateNode = { ...node };
      delete cleared.fallbackEdgeId;
      updateNode(cleared);
      return;
    }
    updateNode({ ...node, fallbackEdgeId: edgeId });
  };

  // ── signal.payloadSchema preview ───────────────────────────────────────
  const hasPayloadSchema =
    node.signal.payloadSchema !== undefined &&
    Object.keys(node.signal.payloadSchema).length > 0;

  return (
    <Stack
      gap="md"
      data-testid="human-gate-node-settings"
      data-node-id={node.id}
    >
      <Box>
        <Title order={5} mb="xs">
          Signal
        </Title>
        <Stack gap="xs">
          <TextInput
            label="Signal name"
            description="Name of the Temporal signal that resumes the workflow."
            placeholder="e.g. approve"
            size="xs"
            withAsterisk
            value={node.signal.name}
            error={signalNameError}
            onChange={(event) => setSignalName(event.currentTarget.value)}
            data-testid="human-gate-node-settings-signal-name"
          />
          {hasPayloadSchema && (
            <Box data-testid="human-gate-node-settings-payload-schema">
              <Text size="xs" fw={600} mb={4}>
                Payload schema
              </Text>
              <Text size="10px" c="dimmed" mb={4}>
                Advanced: schema authoring is not yet supported in V2. Switch to
                the JSON editor to modify this schema.
              </Text>
              <Code
                block
                data-testid="human-gate-node-settings-payload-schema-preview"
              >
                {JSON.stringify(node.signal.payloadSchema, null, 2)}
              </Code>
            </Box>
          )}
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Title order={5} mb="xs">
          Timeout
        </Title>
        <Stack gap="xs">
          <TextInput
            label="Timeout"
            description={TEMPORAL_DURATION_HELP_TEXT}
            placeholder="e.g. 1h"
            size="xs"
            withAsterisk
            value={timeoutDraft}
            error={timeoutError}
            onChange={(event) => commitTimeout(event.currentTarget.value)}
            data-testid="human-gate-node-settings-timeout"
          />
          <Box>
            <Text size="xs" fw={500} mb={4}>
              On timeout
            </Text>
            <Text size="10px" c="dimmed" mb={4}>
              Choose what happens when the gate times out: fail the workflow,
              continue past the gate, or follow a fallback edge.
            </Text>
            <SegmentedControl
              size="xs"
              value={node.onTimeout}
              data={ON_TIMEOUT_OPTIONS}
              onChange={setOnTimeout}
              data-testid="human-gate-node-settings-on-timeout"
            />
          </Box>
          {node.onTimeout === "fallback" && (
            <EdgePicker
              config={config}
              fromNodeId={node.id}
              value={node.fallbackEdgeId ?? null}
              onChange={setFallbackEdgeId}
              label="Fallback edge"
              description="Edge to follow when the gate times out."
              placeholder="Pick a fallback edge…"
              data-testid="human-gate-node-settings-fallback-edge"
            />
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
