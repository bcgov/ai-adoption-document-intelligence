/**
 * `RunHistoryFilters` — sticky filter row inside the `RunHistoryDrawer`.
 *
 * Renders the four filter inputs from TRY_IN_PLACE_DESIGN.md §6.2:
 *   - status `<Select>` ("all" | "running" | "succeeded" | "failed" | "cancelled")
 *   - "From" `<DateInput>` (inclusive lower bound on `startedAt`)
 *   - "To" `<DateInput>` (inclusive upper bound on `startedAt`)
 *   - version `<Select>` (populated from `useWorkflowVersions(workflowId)`)
 *
 * Changes propagate up via the `onChange(filters)` prop. Empty / "all"
 * values translate to `undefined` on the corresponding `ListRunsFilters`
 * field — the hook's URL builder then omits the query parameter
 * entirely so the backend treats the slot as "no filter".
 *
 * Mantine v8's `<DateInput>` emits `DateStringValue | null` (a `YYYY-MM-DD`
 * string), so the From/To handlers normalise it into the ISO timestamp
 * the backend expects (start-of-day UTC for "From", end-of-day UTC for
 * "To").
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L39
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-153-run-history-drawer-and-filters.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.2
 */

import { Group, Select } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";

import {
  useWorkflowVersions,
  type WorkflowVersionSummary,
} from "../../../data/hooks/useWorkflows";
import type { ListRunsFilters, RunSummaryStatus } from "./useWorkflowRuns";

/** Sentinel value for the status `<Select>`'s "all" option. */
const STATUS_ALL = "all" as const;

/** Sentinel value for the version `<Select>`'s "all" option. */
const VERSION_ALL = "all" as const;

const STATUS_OPTIONS: ReadonlyArray<{
  value: typeof STATUS_ALL | RunSummaryStatus;
  label: string;
}> = [
  { value: STATUS_ALL, label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export interface RunHistoryFiltersProps {
  workflowId: string;
  filters: ListRunsFilters;
  onChange: (next: ListRunsFilters) => void;
}

/**
 * Converts a `YYYY-MM-DD` string from `<DateInput>` into the ISO
 * timestamp the backend expects.
 *
 * `endOfDay = true` snaps to 23:59:59.999 so the "To" filter is
 * inclusive of the entire selected day; "From" leaves it at 00:00:00.
 * Returns `undefined` for null / empty input so the URL builder omits
 * the query parameter.
 */
function dateStringToIso(
  value: string | null,
  opts: { endOfDay?: boolean } = {},
): string | undefined {
  if (!value) return undefined;
  // `YYYY-MM-DD` parses as midnight UTC; `endOfDay` snaps to the last
  // millisecond of the same UTC day so the inclusive-upper-bound
  // semantics match the user's mental model.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (opts.endOfDay) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed.toISOString();
}

/**
 * Converts the ISO timestamp stored on `filters.startedAfter` /
 * `filters.startedBefore` back into a `YYYY-MM-DD` string for the
 * `<DateInput>`'s `value` prop. Invalid timestamps surface as `null`.
 */
function isoToDateString(iso: string | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  // ISO `YYYY-MM-DDTHH:mm:ss.sssZ` — slice the date portion only.
  return parsed.toISOString().slice(0, 10);
}

export function RunHistoryFilters({
  workflowId,
  filters,
  onChange,
}: RunHistoryFiltersProps) {
  const versionsQuery = useWorkflowVersions(workflowId);
  const versions: WorkflowVersionSummary[] = versionsQuery.data ?? [];

  const versionOptions: Array<{ value: string; label: string }> = [
    { value: VERSION_ALL, label: "All versions" },
    ...versions.map((v) => ({
      value: v.id,
      label: `v${v.versionNumber}`,
    })),
  ];

  const handleStatusChange = (value: string | null) => {
    if (value === null || value === STATUS_ALL) {
      onChange({ ...filters, status: undefined });
      return;
    }
    onChange({ ...filters, status: value as RunSummaryStatus });
  };

  const handleFromChange = (value: string | null) => {
    onChange({ ...filters, startedAfter: dateStringToIso(value) });
  };

  const handleToChange = (value: string | null) => {
    onChange({
      ...filters,
      startedBefore: dateStringToIso(value, { endOfDay: true }),
    });
  };

  const handleVersionChange = (value: string | null) => {
    if (value === null || value === VERSION_ALL) {
      onChange({ ...filters, workflowVersionId: undefined });
      return;
    }
    onChange({ ...filters, workflowVersionId: value });
  };

  return (
    <Group gap="xs" wrap="wrap" data-testid="run-history-filters">
      <Select
        label="Status"
        size="xs"
        data={
          STATUS_OPTIONS as unknown as Array<{ value: string; label: string }>
        }
        value={filters.status ?? STATUS_ALL}
        onChange={handleStatusChange}
        allowDeselect={false}
        data-testid="run-history-filter-status"
        style={{ minWidth: 140 }}
      />
      <DateInput
        label="From"
        size="xs"
        clearable
        valueFormat="YYYY-MM-DD"
        value={isoToDateString(filters.startedAfter)}
        onChange={handleFromChange}
        data-testid="run-history-filter-from"
        style={{ minWidth: 140 }}
      />
      <DateInput
        label="To"
        size="xs"
        clearable
        valueFormat="YYYY-MM-DD"
        value={isoToDateString(filters.startedBefore)}
        onChange={handleToChange}
        data-testid="run-history-filter-to"
        style={{ minWidth: 140 }}
      />
      <Select
        label="Version"
        size="xs"
        data={versionOptions}
        value={filters.workflowVersionId ?? VERSION_ALL}
        onChange={handleVersionChange}
        allowDeselect={false}
        data-testid="run-history-filter-version"
        style={{ minWidth: 140 }}
      />
    </Group>
  );
}
