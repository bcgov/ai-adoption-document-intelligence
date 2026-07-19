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
  Alert,
  Autocomplete,
  Box,
  Divider,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type {
  GraphWorkflowConfig,
  HumanGateNode,
} from "../../../../types/workflow";
import { EdgePicker } from "../../graph-widgets";
import { replaceNode } from "../../replace-node";
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

/**
 * Common signal names offered as autocomplete suggestions. The name is
 * author-chosen (any string works) — these are just conventional starting
 * points so authors don't have to invent one blind. `humanApproval` is what
 * the HITL Review flow sends.
 */
const SIGNAL_NAME_PRESETS = [
  "humanApproval",
  "approve",
  "review",
  "reject",
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HumanGateNodeSettings({
  node,
  config,
  onConfigChange,
}: HumanGateNodeSettingsProps) {
  const updateNode = (next: HumanGateNode) => {
    onConfigChange(replaceNode(config, node.id, next));
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

  // ── signal.payloadSchema (editable JSON draft) ─────────────────────────
  // The schema is a small `{ field: type }` map describing the approval
  // payload a reviewer sends. Edit it as JSON; commit on valid parse.
  const [schemaDraft, setSchemaDraft] = useState("");
  const [schemaError, setSchemaError] = useState<string | null>(null);
  // Reseed the draft only when the selected node changes (not on every
  // keystroke, which would fight the user's typing).
  useEffect(() => {
    setSchemaDraft(
      node.signal.payloadSchema
        ? JSON.stringify(node.signal.payloadSchema, null, 2)
        : "",
    );
    setSchemaError(null);
  }, [node.id]);

  const commitSchemaDraft = (raw: string) => {
    setSchemaDraft(raw);
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      // Cleared → drop the schema from the node.
      setSchemaError(null);
      const cleared: HumanGateNode = {
        ...node,
        signal: { ...node.signal },
      };
      delete cleared.signal.payloadSchema;
      updateNode(cleared);
      return;
    }
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, string>;
    } catch (err) {
      setSchemaError(
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    setSchemaError(null);
    updateNode({
      ...node,
      signal: { ...node.signal, payloadSchema: parsed },
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
          <Alert
            variant="light"
            color="blue"
            icon={<IconInfoCircle size={16} />}
            data-testid="human-gate-node-settings-how-it-works"
          >
            <Text size="xs">
              This node <strong>pauses the run</strong> until a matching signal
              arrives. A reviewer approves it from the{" "}
              <strong>HITL Review</strong> screen (or any caller that sends this
              signal) and the run resumes. The <strong>signal name</strong> is a
              label you choose — it just has to match what the sender uses; the
              HITL flow sends <code>humanApproval</code>.
            </Text>
          </Alert>
          <Autocomplete
            label="Signal name"
            description="The Temporal signal that resumes the run. Pick a common name or type your own."
            placeholder="e.g. humanApproval"
            size="xs"
            withAsterisk
            data={[...SIGNAL_NAME_PRESETS]}
            value={node.signal.name}
            error={signalNameError}
            onChange={setSignalName}
            data-testid="human-gate-node-settings-signal-name"
          />
          <Box data-testid="human-gate-node-settings-payload-schema">
            <Text size="xs" fw={600} mb={4}>
              Payload schema (optional)
            </Text>
            <Text size="10px" c="dimmed" mb={4}>
              The shape of the approval payload a reviewer sends, as a JSON{" "}
              <code>{`{ "field": "type" }`}</code> map (e.g.{" "}
              <code>{`{ "approved": "boolean", "reviewer": "string" }`}</code>).
              Leave empty for no declared payload.
            </Text>
            <Textarea
              autosize
              minRows={3}
              maxRows={12}
              size="xs"
              placeholder={`{ "approved": "boolean" }`}
              styles={{ input: { fontFamily: "monospace", fontSize: 11 } }}
              value={schemaDraft}
              error={schemaError}
              onChange={(event) => commitSchemaDraft(event.currentTarget.value)}
              data-testid="human-gate-node-settings-payload-schema-editor"
            />
          </Box>
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
