/**
 * `RunRow` — single row inside the `RunHistoryDrawer`'s scrollable list
 * (US-154).
 *
 * Renders one row per `RunSummary`:
 *
 *   - Status dot whose colour matches the `NodeStatusBadge` palette
 *     (pending=gray, running=blue, succeeded=green, failed=red,
 *     cancelled=gray).
 *   - Version pin: `v{N} — head` when the row's `workflowVersionId`
 *     matches the editor's current head, else `v{N}`.
 *   - Start timestamp formatted as a short relative string (e.g. "2 hours
 *     ago") with a `<Tooltip>` over the absolute ISO timestamp. `date-fns`
 *     isn't on the frontend's dep list so the relative formatter is a
 *     small inline helper.
 *   - `inputCtxSummary` chip — truncated `key=value, key=value` for the
 *     first two keys, wrapped in a multi-line `<Tooltip w={400}>` that
 *     shows the full summary (first four keys per L40 / US-150 §4).
 *   - "Replay" button that fires the `onReplay` callback.
 *
 * Clicking the row body OR the Replay button calls `onReplay(runId)` —
 * the parent owns the side effects (setting `activeRunId` + `isReplay`,
 * closing the drawer).
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L40 + L41
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-154-run-row-and-replay-flow.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.3
 */

import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconPlayerPlay } from "@tabler/icons-react";
import type { MouseEvent } from "react";

import type { RunSummary, RunSummaryStatus } from "./useWorkflowRuns";

/** Status → colour mapping mirrors `NodeStatusBadge` (US-138). */
const STATUS_COLOR: Record<RunSummaryStatus, string> = {
  running: "blue",
  succeeded: "green",
  failed: "red",
  cancelled: "gray",
};

/**
 * Compact relative-time formatter — returns "Just now" / "5 minutes ago"
 * / "2 hours ago" / "3 days ago" / absolute locale date for older
 * entries. Used here in place of `date-fns`'s `formatDistanceToNow`
 * (not a frontend dep).
 */
function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  const diffMs = now.getTime() - parsed.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) {
    return "Just now";
  }
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  }
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) {
    return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  }
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) {
    return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  }
  return parsed.toLocaleDateString();
}

/**
 * Renders a compact `key=value` summary of the first `take` keys of an
 * `inputCtxSummary` record. Strings render unquoted; other primitives go
 * through `JSON.stringify` so objects don't collapse to `[object Object]`.
 */
function summariseCtx(
  ctx: Record<string, unknown> | undefined,
  take: number,
): string {
  if (!ctx) return "";
  const entries = Object.entries(ctx).slice(0, take);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => {
      const rendered = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${rendered}`;
    })
    .join(", ");
}

export interface RunRowProps {
  run: RunSummary;
  /**
   * Lineage's current head version id — used to flag the row's version
   * pin with " — head" when the run was executed against head. When
   * undefined, no row is flagged.
   */
  headVersionId?: string;
  /**
   * Click handler for the Replay button AND the row body. Receives the
   * `runId` so the parent can set `activeRunId` / `isReplay` and close
   * the drawer.
   */
  onReplay: (runId: string) => void;
}

export function RunRow({ run, headVersionId, onReplay }: RunRowProps) {
  const dotColor = STATUS_COLOR[run.status];
  const isHead =
    headVersionId !== undefined && run.workflowVersionId === headVersionId;
  const versionPin = isHead
    ? `v${run.versionNumber} — head`
    : `v${run.versionNumber}`;

  const relativeStarted = formatRelativeTime(run.startedAt);
  const absoluteStarted = run.startedAt;

  const ctxSummaryShort = summariseCtx(run.inputCtxSummary, 2);
  const ctxSummaryFull = summariseCtx(run.inputCtxSummary, 4);
  const hasCtxSummary = ctxSummaryShort.length > 0;

  const handleRowClick = () => {
    onReplay(run.runId);
  };

  const handleReplayClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Prevent the row-level click handler from double-firing.
    e.stopPropagation();
    onReplay(run.runId);
  };

  return (
    <Paper
      p="sm"
      withBorder
      radius="sm"
      data-testid={`run-row-${run.runId}`}
      data-status={run.status}
      data-version-number={run.versionNumber}
      data-is-head={isHead ? "true" : "false"}
      onClick={handleRowClick}
      style={{ cursor: "pointer" }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm" align="center">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Tooltip label={`Status: ${run.status}`} withArrow>
            <Box
              data-testid={`run-row-status-dot-${run.runId}`}
              data-color={dotColor}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: `var(--mantine-color-${dotColor}-6)`,
                flexShrink: 0,
              }}
              aria-label={`Status: ${run.status}`}
            />
          </Tooltip>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Group gap="xs" wrap="nowrap" align="center">
              <Badge
                size="xs"
                color={isHead ? "blue" : "gray"}
                variant={isHead ? "filled" : "light"}
                data-testid={`run-row-version-pin-${run.runId}`}
              >
                {versionPin}
              </Badge>
              <Tooltip label={absoluteStarted} withArrow>
                <Text
                  size="xs"
                  c="dimmed"
                  data-testid={`run-row-started-${run.runId}`}
                >
                  {relativeStarted}
                </Text>
              </Tooltip>
            </Group>
            {hasCtxSummary && (
              <Tooltip
                multiline
                w={400}
                label={ctxSummaryFull}
                withArrow
                position="bottom-start"
              >
                <Badge
                  size="xs"
                  color="gray"
                  variant="outline"
                  style={{ maxWidth: "100%" }}
                  data-testid={`run-row-input-ctx-${run.runId}`}
                >
                  {ctxSummaryShort}
                </Badge>
              </Tooltip>
            )}
          </Stack>
        </Group>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlayerPlay size={12} />}
          onClick={handleReplayClick}
          data-testid={`run-row-replay-${run.runId}`}
        >
          Replay
        </Button>
      </Group>
    </Paper>
  );
}
