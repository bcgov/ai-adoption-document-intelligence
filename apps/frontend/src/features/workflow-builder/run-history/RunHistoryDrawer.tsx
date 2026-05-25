/**
 * `RunHistoryDrawer` — Phase 4 run-history drawer (US-153).
 *
 * Sibling to `VersionHistoryDrawer` (Phase 2 Track 3): the editor mounts
 * the outer `<Drawer position="right" size="lg">` and renders this body
 * inside. The body is responsible for:
 *
 *   - A sticky filters header (`RunHistoryFilters`) that drives the
 *     hook's query key.
 *   - A scrollable list of `<RunRow>` rows (one per run; row content is
 *     a US-154 stub right now).
 *   - An `IntersectionObserver` sentinel at the bottom of the list that
 *     triggers `fetchNextPage` when it scrolls into view.
 *   - Loading (3 Skeleton rows), empty ("No runs match these filters."),
 *     and error (red `<Alert>`) states.
 *   - An "End of history" line when `hasNextPage === false`.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L39
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-153-run-history-drawer-and-filters.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.2
 */

import { Alert, Box, Skeleton, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { RunHistoryFilters } from "./RunHistoryFilters";
import { RunRow } from "./RunRow";
import { type ListRunsFilters, useWorkflowRuns } from "./useWorkflowRuns";

export interface RunHistoryDrawerProps {
  workflowId: string;
  /**
   * Lineage's current head version id — forwarded to each `<RunRow>` so
   * rows whose `workflowVersionId` matches show the "— head" pin
   * decoration (US-154).
   */
  headVersionId?: string;
  /**
   * Replay click handler — fired by `<RunRow>` when the user clicks the
   * row body or its Replay button. The parent owns the side effects
   * (setting `activeRunId` / `isReplay` and closing the drawer).
   */
  onReplay: (runId: string) => void;
}

export function RunHistoryDrawer({
  workflowId,
  headVersionId,
  onReplay,
}: RunHistoryDrawerProps) {
  // Filter state lives in the drawer (not the editor) — the editor only
  // owns drawer open/closed. Changes here re-key the hook and reset
  // pagination automatically.
  const [filters, setFilters] = useState<ListRunsFilters>({});

  const query = useWorkflowRuns(workflowId, filters);
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = query;

  // Flatten paged responses into a single newest-first list.
  const runs = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.runs);
  }, [data]);

  // ---------------------------------------------------------------------
  // IntersectionObserver sentinel — fires `fetchNextPage` when the
  // bottom marker scrolls into view. We re-arm by attaching a fresh
  // observer whenever `hasNextPage` or `isFetchingNextPage` flips so a
  // single observer doesn't double-fire while a fetch is in flight.
  // ---------------------------------------------------------------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (!hasNextPage) return;
    if (isFetchingNextPage) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            fetchNextPage();
            break;
          }
        }
      },
      { root: null, rootMargin: "0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Stack gap="sm" data-testid="run-history-drawer">
      <Box
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          background: "var(--mantine-color-body, #1a1b1e)",
          paddingBottom: 8,
        }}
        data-testid="run-history-drawer-header"
      >
        <RunHistoryFilters
          workflowId={workflowId}
          filters={filters}
          onChange={setFilters}
        />
      </Box>

      {isLoading ? (
        <Stack gap="sm" data-testid="run-history-drawer-loading">
          <Skeleton height={64} radius="sm" />
          <Skeleton height={64} radius="sm" />
          <Skeleton height={64} radius="sm" />
        </Stack>
      ) : isError ? (
        <Alert color="red" title="Failed to load runs">
          {error instanceof Error ? error.message : "Unknown error"}
        </Alert>
      ) : runs.length === 0 ? (
        <Text size="sm" c="dimmed" data-testid="run-history-drawer-empty">
          No runs match these filters.
        </Text>
      ) : (
        <Stack gap="xs" data-testid="run-history-drawer-list">
          {runs.map((run) => (
            <RunRow
              key={run.runId}
              run={run}
              headVersionId={headVersionId}
              onReplay={onReplay}
            />
          ))}
          {hasNextPage ? (
            <Box
              ref={sentinelRef}
              data-testid="run-history-drawer-sentinel"
              style={{ height: 1 }}
            />
          ) : (
            <Text
              size="xs"
              c="dimmed"
              ta="center"
              data-testid="run-history-drawer-end"
            >
              End of history
            </Text>
          )}
          {isFetchingNextPage && (
            <Skeleton
              height={64}
              radius="sm"
              data-testid="run-history-drawer-next-loading"
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}
