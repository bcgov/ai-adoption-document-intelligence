/**
 * Validation drawer.
 *
 * Lists every workflow validation issue grouped by node, plus
 * workflow-level issues. Each row is clickable — selecting it focuses
 * the corresponding node on the canvas and closes the drawer.
 */

import type {
  GraphValidationError,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import {
  Anchor,
  Badge,
  Box,
  Drawer,
  Group,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconExclamationCircle,
} from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import type { GraphValidationResult } from "./useGraphValidation";

interface ValidationDrawerProps {
  opened: boolean;
  onClose: () => void;
  result: GraphValidationResult;
  config: GraphWorkflowConfig;
  onSelectNode: (nodeId: string) => void;
  /**
   * Deep-link for an input-anchored issue (an unbound / ambiguous port folded
   * in from auto-wire): instead of just selecting the node, open that input's
   * source picker. Falls back to plain selection when absent or the issue
   * isn't input-anchored.
   */
  onFixNodeInput?: (nodeId: string, port: string) => void;
  /**
   * When set, the drawer scrolls the matching node's entry into view on
   * open. Used by the canvas validation badges — clicking a badge opens
   * the drawer scrolled to the relevant entry.
   */
  focusedNodeId?: string | null;
  /**
   * Node-scoped mode. When set, the drawer shows ONLY that node's issues
   * (naming the node in its title) and omits workflow-level errors + every
   * other node's bucket. Used by the canvas problems badge so a single
   * badge never dumps the whole workflow's issue list. `null`/absent renders
   * the full global list (top-bar "Warnings" behaviour).
   */
  filterNodeId?: string | null;
  /**
   * Escape hatch from node-scoped mode back to the full list. Rendered as a
   * "Show all problems" affordance when `filterNodeId` is set.
   */
  onShowAll?: () => void;
}

/**
 * Parse a `nodes.<id>.inputs.<port>` validation path into its node + port.
 * Returns null for any other path shape. `<id>` may contain dots (greedy);
 * `<port>` is the final segment.
 */
function parseInputPortPath(
  path: string,
): { nodeId: string; port: string } | null {
  const match = /^nodes\.(.+)\.inputs\.([^.]+)$/.exec(path);
  if (!match) return null;
  return { nodeId: match[1], port: match[2] };
}

export function ValidationDrawer({
  opened,
  onClose,
  result,
  config,
  onSelectNode,
  onFixNodeInput,
  focusedNodeId,
  filterNodeId,
  onShowAll,
}: ValidationDrawerProps) {
  const handleSelect = (nodeId: string) => {
    onSelectNode(nodeId);
    onClose();
  };

  /** Click handler for a single issue row — deep-links input issues. */
  const handleIssueClick = (err: GraphValidationError, nodeId: string) => {
    const target = parseInputPortPath(err.path);
    if (target && onFixNodeInput) {
      onFixNodeInput(target.nodeId, target.port);
      onClose();
      return;
    }
    handleSelect(nodeId);
  };

  const isFiltered = filterNodeId != null;

  const nodeBuckets = [...result.errorsByNode.entries()]
    .filter(([nodeId]) => !isFiltered || nodeId === filterNodeId)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const filteredNodeLabel =
    isFiltered && filterNodeId != null
      ? (config.nodes[filterNodeId]?.label ?? filterNodeId)
      : null;
  const title =
    isFiltered && filteredNodeLabel != null
      ? `Problems on ${filteredNodeLabel}`
      : "Validation";

  const entryRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!opened || !focusedNodeId) return;
    // Defer one frame so Mantine has mounted the drawer's portal before
    // we attempt to scroll the entry into view.
    const handle = window.setTimeout(() => {
      const el = entryRefs.current.get(focusedNodeId);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [opened, focusedNodeId]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={420}
      title={title}
      overlayProps={{ opacity: 0.3 }}
      withinPortal
    >
      <Stack gap="md">
        {isFiltered ? (
          <>
            {onShowAll && (
              <Anchor
                component="button"
                type="button"
                size="xs"
                onClick={onShowAll}
                style={{ alignSelf: "flex-start" }}
              >
                Show all problems
              </Anchor>
            )}
            {nodeBuckets.length === 0 && (
              <Text size="sm" c="dimmed">
                No problems on this node.
              </Text>
            )}
          </>
        ) : (
          <>
            <SummaryBar result={result} />

            {result.errors.length === 0 && (
              <Group gap="xs" mt="md">
                <ThemeIcon color="green" variant="light" size="sm" radius="xl">
                  <IconCircleCheck size={14} />
                </ThemeIcon>
                <Text size="sm">No issues. Workflow is valid.</Text>
              </Group>
            )}

            {result.workflowLevelErrors.length > 0 && (
              <Box>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={6}>
                  Workflow-level
                </Text>
                <Stack gap={6}>
                  {result.workflowLevelErrors.map((err, i) => (
                    <IssueRow
                      key={`${err.path}-${i}`}
                      error={err}
                      onClick={undefined}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}

        {nodeBuckets.map(([nodeId, errs]) => {
          const node = config.nodes[nodeId];
          const label = node?.label ?? nodeId;
          const errorCount = errs.filter((e) => e.severity === "error").length;
          const warningCount = errs.length - errorCount;
          return (
            <Box
              key={nodeId}
              data-testid={`validation-entry-${nodeId}`}
              ref={(el: HTMLDivElement | null) => {
                entryRefs.current.set(nodeId, el);
              }}
            >
              <Group justify="space-between" mb={6}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  {label}
                </Text>
                <Group gap={4}>
                  {errorCount > 0 && (
                    <Badge size="xs" color="red" variant="light">
                      {errorCount} error{errorCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge size="xs" color="yellow" variant="light">
                      {warningCount} warning{warningCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                </Group>
              </Group>
              <Stack gap={6}>
                {errs.map((err, i) => {
                  const isInput = parseInputPortPath(err.path) != null;
                  // Node-scoped mode: the node is already selected, so
                  // "Select node →" on a non-input row is a redundant no-op.
                  // Drop the hint and make the row explain-only. Input rows
                  // keep their picker deep-link in both modes.
                  const explainOnly = isFiltered && !isInput;
                  return (
                    <IssueRow
                      key={`${err.path}-${i}`}
                      error={err}
                      onClick={
                        explainOnly
                          ? undefined
                          : () => handleIssueClick(err, nodeId)
                      }
                      actionHint={
                        explainOnly
                          ? undefined
                          : isInput
                            ? "pick-source"
                            : "select-node"
                      }
                    />
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Drawer>
  );
}

function SummaryBar({ result }: { result: GraphValidationResult }) {
  return (
    <Group gap="xs">
      <Badge
        color={result.errorCount > 0 ? "red" : "gray"}
        variant={result.errorCount > 0 ? "filled" : "light"}
      >
        {result.errorCount} error{result.errorCount === 1 ? "" : "s"}
      </Badge>
      <Badge
        color={result.warningCount > 0 ? "yellow" : "gray"}
        variant={result.warningCount > 0 ? "filled" : "light"}
      >
        {result.warningCount} warning{result.warningCount === 1 ? "" : "s"}
      </Badge>
      {result.isPending && (
        <Text size="xs" c="dimmed">
          Re-checking…
        </Text>
      )}
    </Group>
  );
}

interface IssueRowProps {
  error: GraphValidationError;
  onClick: (() => void) | undefined;
  /**
   * What the row does when clicked, surfaced as a right-aligned hint so the
   * user can see a fix exists before clicking. `"pick-source"` opens the
   * input's source picker (input-anchored issues); `"select-node"` just
   * focuses the node (structural issues). Absent for non-clickable rows.
   */
  actionHint?: "pick-source" | "select-node";
}

function IssueRow({ error, onClick, actionHint }: IssueRowProps) {
  const isError = error.severity === "error";
  const color = isError ? "red" : "yellow";
  const Icon = isError ? IconExclamationCircle : IconAlertTriangle;

  const hintLabel =
    actionHint === "pick-source"
      ? "Pick a source →"
      : actionHint === "select-node"
        ? "Select node →"
        : null;

  const content = (
    <Group gap={8} wrap="nowrap" align="flex-start" p={6}>
      <ThemeIcon color={color} variant="light" size="sm" radius="xl">
        <Icon size={14} />
      </ThemeIcon>
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Text size="xs" lh={1.3}>
          {error.message}
        </Text>
        <Text size="10px" c="dimmed" ff="monospace" truncate>
          {error.path || "(root)"}
        </Text>
      </Box>
      {hintLabel && (
        <Text size="xs" c={color} fw={500} style={{ whiteSpace: "nowrap" }}>
          {hintLabel}
        </Text>
      )}
    </Group>
  );

  if (!onClick) {
    return <Box style={{ borderRadius: 6 }}>{content}</Box>;
  }
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        borderRadius: 6,
        background: "transparent",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "var(--mantine-color-default-hover, #25262b)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {content}
    </UnstyledButton>
  );
}
