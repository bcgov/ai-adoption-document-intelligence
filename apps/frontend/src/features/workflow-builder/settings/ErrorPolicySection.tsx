/**
 * ErrorPolicySection — the authoring surface for `GraphNodeBase.errorPolicy`
 * (G-001).
 *
 * Everything downstream of this form already existed:
 *   - the engine reads `onError` / `fallbackEdgeId` / `retryable`
 *     (`apps/temporal/src/graph-engine/error-handling.ts`);
 *   - the validator errors when `onError: "fallback"` has no
 *     `fallbackEdgeId` (`validator.ts` → `validateErrorPolicies`);
 *   - the canvas mounts a second bottom `error` source handle as soon as the
 *     policy asks for it (`WorkflowEditorCanvas.tsx` → `NodeHandles` /
 *     `ActivityNodeRenderer`).
 *
 * There was simply no way for an author to set the policy, so one of the
 * three edge flavours the model defines was undrawable and a `fallback`
 * policy arriving from a template or the agent reported a validation error
 * the UI gave no way to clear.
 *
 * Deliberate scope decisions:
 *
 *   - **Offered only where the canvas can draw the handle.** `switch` routes
 *     through `cases`/`defaultEdge` and `source` is the graph's entry point;
 *     neither renderer mounts an `error` handle (see `mountsErrorHandle`), so
 *     offering the policy there would author a state the canvas cannot draw
 *     — the exact mismatch this section exists to remove.
 *   - **An absent policy stays absent.** "No policy" is a real, meaningful
 *     state (the engine defaults to `fail` with a retryable failure), so the
 *     section starts as a single "Add error handling" affordance rather than
 *     writing a policy onto every node the user merely looks at. Adding one
 *     seeds exactly the engine's default so the button changes nothing about
 *     how the workflow runs.
 *   - **`ErrorPolicy.maxRetries` is not offered.** It is declared on the type
 *     but no engine code reads it — retry counts come from
 *     `ActivityNode.retry.maximumAttempts`. A control that silently does
 *     nothing is the same failure mode as the missing form it would sit in.
 *   - **The author never sees `fail` / `fallback` / `skip`.** Those are
 *     engine values; the form speaks in outcomes.
 */

import {
  Box,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import type {
  ErrorPolicy,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { EdgePicker } from "../graph-widgets";
import { replaceNode } from "../replace-node";

export interface ErrorPolicySectionProps {
  node: GraphNode;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

/**
 * The engine's behaviour for a node with NO policy: fail the node, and leave
 * the resulting failure retryable (`handleNodeError` only marks a failure
 * non-retryable when `retryable === false`). Adding a policy therefore
 * changes nothing until the author changes a field.
 */
const ENGINE_DEFAULT_POLICY: ErrorPolicy = {
  onError: "fail",
  retryable: true,
};

/**
 * User-facing wording for the three `onError` values. The engine strings
 * never reach the screen.
 */
const ON_ERROR_OPTIONS: Array<{
  value: ErrorPolicy["onError"];
  label: string;
}> = [
  { value: "fail", label: "Stop the workflow" },
  { value: "fallback", label: "Follow the error path" },
  { value: "skip", label: "Skip this step and continue" },
];

const ON_ERROR_HELP: Record<ErrorPolicy["onError"], string> = {
  fail: "The run ends here and the failure is reported.",
  fallback:
    "The run continues down the error edge drawn from this node's bottom handle.",
  skip: "This step is marked skipped and the run carries on to the next one.",
};

function isOnErrorValue(value: string): value is ErrorPolicy["onError"] {
  return value === "fail" || value === "fallback" || value === "skip";
}

/**
 * Node types whose canvas renderer mounts the bottom `error` source handle.
 * Mirrors `mountsErrorHandle` in `WorkflowEditorCanvas.tsx` — keep the two in
 * step, or the form and the canvas will disagree about whether an error path
 * can exist.
 */
export function supportsErrorPolicy(node: GraphNode): boolean {
  return node.type !== "switch" && node.type !== "source";
}

export function ErrorPolicySection({
  node,
  config,
  onConfigChange,
}: ErrorPolicySectionProps) {
  if (!supportsErrorPolicy(node)) return null;

  const policy = node.errorPolicy;

  const writePolicy = (next: ErrorPolicy | undefined) => {
    const updated = { ...node } as GraphNode;
    if (next === undefined) {
      delete updated.errorPolicy;
    } else {
      updated.errorPolicy = next;
    }
    onConfigChange(replaceNode(config, node.id, updated));
  };

  if (!policy) {
    return (
      <Box data-testid="error-policy-section">
        <Title order={5} mb={4}>
          Error handling
        </Title>
        <Text size="10px" c="dimmed" mb={6}>
          This step currently uses the default: a failure stops the workflow.
          Add a policy to skip the step instead, or to send the run down an
          error path.
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => writePolicy({ ...ENGINE_DEFAULT_POLICY })}
          data-testid="error-policy-add"
        >
          Add error handling
        </Button>
      </Box>
    );
  }

  const setOnError = (raw: string) => {
    if (!isOnErrorValue(raw)) return;
    if (raw === policy.onError) return;
    const next: ErrorPolicy = { ...policy, onError: raw };
    // Moving away from the error path must not leave the edge reference
    // behind: a stale `fallbackEdgeId` is a dangling reference that the
    // validator would stop checking (it only looks when onError is
    // "fallback") and that would silently reactivate on a later switch back.
    if (raw !== "fallback") delete next.fallbackEdgeId;
    writePolicy(next);
  };

  const setFallbackEdgeId = (edgeId: string | null) => {
    const next: ErrorPolicy = { ...policy };
    if (edgeId === null) delete next.fallbackEdgeId;
    else next.fallbackEdgeId = edgeId;
    writePolicy(next);
  };

  return (
    <Box data-testid="error-policy-section">
      <Group justify="space-between" align="center" mb={4} wrap="nowrap">
        <Title order={5}>Error handling</Title>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          onClick={() => writePolicy(undefined)}
          data-testid="error-policy-remove"
        >
          Use the default
        </Button>
      </Group>
      <Stack gap="xs">
        <Box>
          <Text size="xs" fw={500} mb={4}>
            If this step fails
          </Text>
          <SegmentedControl
            size="xs"
            value={policy.onError}
            data={ON_ERROR_OPTIONS}
            onChange={setOnError}
            data-testid="error-policy-on-error"
          />
          <Text size="10px" c="dimmed" mt={4}>
            {ON_ERROR_HELP[policy.onError]}
          </Text>
        </Box>

        {policy.onError === "fallback" && (
          <EdgePicker
            config={config}
            fromNodeId={node.id}
            edgeTypes={["error"]}
            value={policy.fallbackEdgeId ?? null}
            onChange={setFallbackEdgeId}
            required
            label="Error path"
            description="Drag from this node's bottom handle to draw one, then pick it here."
            placeholder="Pick an error path…"
            data-testid="error-policy-fallback-edge"
          />
        )}

        <Switch
          size="xs"
          checked={policy.retryable !== false}
          onChange={(event) =>
            writePolicy({ ...policy, retryable: event.currentTarget.checked })
          }
          label="Allow the whole run to be retried after this failure"
          description="Turn off to mark the failure permanent, so a retry of the run stops here immediately."
          data-testid="error-policy-retryable"
        />
      </Stack>
    </Box>
  );
}
