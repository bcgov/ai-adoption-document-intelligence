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
 *     optional. Empty means no time limit: the run waits until the signal
 *     arrives, and clearing the field removes the timeout from the node.
 *     Invalid drafts surface an inline error and are not propagated
 *     through `onConfigChange`.
 *   - `onTimeout` — `SegmentedControl` with `fail` / `continue` /
 *     `fallback`. Only rendered while the node has a timeout.
 *   - `fallbackEdgeId` — `EdgePicker` (FR-1b) scoped to edges originating
 *     from this node. Only rendered while the node has a timeout and
 *     `onTimeout === "fallback"`. Switching `onTimeout` away from
 *     `fallback` drops the field from the emitted node so the JSON stays
 *     clean.
 *
 * The signal name, payload schema and timeout keep what is typed locally and
 * commit it once typing pauses, on blur, or when the panel unmounts, so a
 * keystroke does not rewrite the workflow.
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
import { useMemo } from "react";
import type {
  GraphWorkflowConfig,
  HumanGateNode,
} from "../../../../types/workflow";
import { EdgePicker } from "../../graph-widgets";
import { replaceNode } from "../../replace-node";
import { useDebouncedTextCommit } from "../../use-debounced-text-commit";
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
 * Signal names offered as autocomplete suggestions. Only `humanApproval` is
 * ever sent by this system (the HITL review flow — see
 * `TemporalClientService.sendHumanApproval`), so it is the only name suggested.
 * The field stays free-text: a gate may be resumed by an external system that
 * sends its own name.
 */
const SIGNAL_NAME_PRESETS = ["humanApproval"] as const;

type PayloadSchema = NonNullable<HumanGateNode["signal"]["payloadSchema"]>;

type PayloadSchemaText =
  | { kind: "empty" }
  | { kind: "schema"; schema: PayloadSchema }
  | { kind: "invalid"; message: string };

function formatPayloadSchema(schema: PayloadSchema | undefined): string {
  return schema ? JSON.stringify(schema, null, 2) : "";
}

/** Reads the payload-schema editor's text: empty, a schema, or a parse error. */
function readPayloadSchema(text: string): PayloadSchemaText {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { kind: "empty" };
  try {
    return { kind: "schema", schema: JSON.parse(trimmed) as PayloadSchema };
  } catch (err) {
    return {
      kind: "invalid",
      message: err instanceof Error ? err.message : String(err),
    };
  }
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
    onConfigChange(replaceNode(config, node.id, next));
  };

  // ── signal.name (required) ─────────────────────────────────────────────
  const setSignalName = (raw: string) => {
    if (raw === node.signal.name) return;
    updateNode({
      ...node,
      signal: { ...node.signal, name: raw },
    });
  };
  const signalName = useDebouncedTextCommit(node.signal.name, setSignalName);
  const signalNameError =
    signalName.draft.length === 0 ? "Signal name is required." : null;

  // ── signal.payloadSchema (editable JSON draft) ─────────────────────────
  // The schema is a small `{ field: type }` map describing the approval
  // payload a reviewer sends. Edit it as JSON; text that parses is committed.
  //
  // The text is seeded from the node only when another node is shown, never
  // from this editor's own commit coming back: a committed schema returns
  // reformatted, and replacing the text with it mid-edit would move the
  // caret.
  const schemaSeed = useMemo(
    () => formatPayloadSchema(node.signal.payloadSchema),
    [node.id],
  );
  const commitSchemaText = (raw: string) => {
    const read = readPayloadSchema(raw);
    if (read.kind === "invalid") return;
    if (read.kind === "empty") {
      // Cleared → drop the schema from the node.
      if (node.signal.payloadSchema === undefined) return;
      const cleared: HumanGateNode = {
        ...node,
        signal: { ...node.signal },
      };
      delete cleared.signal.payloadSchema;
      updateNode(cleared);
      return;
    }
    updateNode({
      ...node,
      signal: { ...node.signal, payloadSchema: read.schema },
    });
  };
  const schemaText = useDebouncedTextCommit(schemaSeed, commitSchemaText);
  const schemaRead = useMemo(
    () => readPayloadSchema(schemaText.draft),
    [schemaText.draft],
  );
  const schemaError =
    schemaRead.kind === "invalid"
      ? `Invalid JSON: ${schemaRead.message}`
      : null;

  // ── timeout (optional Temporal duration) ───────────────────────────────
  // An invalid draft stays local with an inline error and never reaches the
  // graph config. An empty value means no time limit, so clearing the field
  // removes the timeout.
  const commitTimeout = (raw: string) => {
    if (raw.length === 0) {
      if (node.timeout === undefined) return;
      const cleared: HumanGateNode = { ...node };
      delete cleared.timeout;
      updateNode(cleared);
      return;
    }
    if (!isValidTemporalDuration(raw)) return;
    if (raw === node.timeout) return;
    updateNode({ ...node, timeout: raw });
  };
  const timeoutText = useDebouncedTextCommit(node.timeout ?? "", commitTimeout);
  const timeoutError =
    timeoutText.draft.length > 0 && !isValidTemporalDuration(timeoutText.draft)
      ? "Enter a Temporal duration like 30s, 5m, 1h."
      : null;

  // What happens on timeout only matters while there is a timeout.
  const hasTimeout = node.timeout !== undefined;

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
            value={signalName.draft}
            error={signalNameError}
            onChange={signalName.setDraft}
            onOptionSubmit={signalName.commit}
            onBlur={signalName.flush}
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
              value={schemaText.draft}
              error={schemaError}
              onChange={(event) =>
                schemaText.setDraft(event.currentTarget.value)
              }
              onBlur={schemaText.flush}
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
            description={`Leave empty for no time limit: the run waits until the signal arrives. ${TEMPORAL_DURATION_HELP_TEXT}`}
            placeholder="No time limit"
            size="xs"
            value={timeoutText.draft}
            error={timeoutError}
            onChange={(event) =>
              timeoutText.setDraft(event.currentTarget.value)
            }
            onBlur={timeoutText.flush}
            data-testid="human-gate-node-settings-timeout"
          />
          {hasTimeout && (
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
          )}
          {hasTimeout && node.onTimeout === "fallback" && (
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
