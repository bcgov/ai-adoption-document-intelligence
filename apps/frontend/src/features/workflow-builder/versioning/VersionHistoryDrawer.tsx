/**
 * Version-history drawer body (Phase 2 Track 3 — US-082).
 *
 * Mounted inside the `<Drawer>` wrapper that already lives in
 * `WorkflowEditorV2Page`. Lists every version of the lineage newest-first
 * (the backend's `GET /:id/versions` is already newest-first ordered),
 * marks the current head row with a "head" `<Badge>`, and exposes per-row
 * Revert / Compare buttons.
 *
 * The Revert and Compare click handlers are wired in US-083 / US-084.
 * This story renders the buttons with the correct enabled/disabled state
 * and tooltips; if no handler is provided the click is a no-op.
 */

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  useWorkflowVersions,
  type WorkflowVersionSummary,
} from "../../../data/hooks/useWorkflows";
import { useVersionRunCount } from "./useVersionRunCount";

interface VersionHistoryDrawerProps {
  lineageId: string;
  headVersionId: string | undefined;
  onRevert?: (
    versionId: string,
    versionNumber: number,
    createdAt: string,
  ) => void;
  onCompare?: (
    versionId: string,
    versionNumber: number,
    createdAt: string,
  ) => void;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return DATE_FORMATTER.format(date);
}

export function VersionHistoryDrawer({
  lineageId,
  headVersionId,
  onRevert,
  onCompare,
}: VersionHistoryDrawerProps) {
  const versionsQuery = useWorkflowVersions(lineageId);

  if (versionsQuery.isLoading) {
    return (
      <Stack gap="sm" data-testid="history-drawer-loading">
        <Skeleton height={64} radius="sm" />
        <Skeleton height={64} radius="sm" />
        <Skeleton height={64} radius="sm" />
      </Stack>
    );
  }

  if (versionsQuery.isError) {
    const message =
      versionsQuery.error instanceof Error
        ? versionsQuery.error.message
        : "Unknown error";
    return (
      <Alert color="red" title="Failed to load versions">
        {message}
      </Alert>
    );
  }

  const versions: WorkflowVersionSummary[] = versionsQuery.data ?? [];

  if (versions.length === 0) {
    return (
      <Text size="sm" c="dimmed" data-testid="history-drawer-empty">
        No versions yet — save the workflow first.
      </Text>
    );
  }

  return (
    <Stack gap="sm" data-testid="history-drawer-list">
      {versions.map((version) => (
        <VersionRow
          key={version.id}
          lineageId={lineageId}
          version={version}
          isHead={version.id === headVersionId}
          onRevert={onRevert}
          onCompare={onCompare}
        />
      ))}
    </Stack>
  );
}

interface VersionRowProps {
  lineageId: string;
  version: WorkflowVersionSummary;
  isHead: boolean;
  onRevert?: (
    versionId: string,
    versionNumber: number,
    createdAt: string,
  ) => void;
  onCompare?: (
    versionId: string,
    versionNumber: number,
    createdAt: string,
  ) => void;
}

function VersionRow({
  lineageId,
  version,
  isHead,
  onRevert,
  onCompare,
}: VersionRowProps) {
  const handleRevert = () => {
    if (isHead) return;
    onRevert?.(version.id, version.versionNumber, version.createdAt);
  };

  const handleCompare = () => {
    if (isHead) return;
    onCompare?.(version.id, version.versionNumber, version.createdAt);
  };

  // US-152 — per-row run count badge driven by `useVersionRunCount`.
  // Loading and error states both hide the badge (renders nothing); only
  // a resolved count surfaces "<n> runs" — including "0 runs" (no special
  // hide-for-zero behaviour: explicitness > minimalism).
  const runCountQuery = useVersionRunCount(lineageId, version.id);
  const runCount =
    runCountQuery.error === null
      ? (runCountQuery.data?.runCount ?? null)
      : null;

  return (
    <Card
      withBorder
      padding="sm"
      radius="sm"
      data-testid={`history-row-${version.id}`}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" align="center">
            <Badge color="indigo" variant="light">
              v{version.versionNumber}
            </Badge>
            {isHead && (
              <Badge color="blue" data-testid="history-row-head-badge">
                head
              </Badge>
            )}
            {runCount !== null && (
              <Badge
                variant="light"
                color="gray"
                data-testid={`history-row-run-count-${version.id}`}
              >
                {runCount} runs
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {formatTimestamp(version.createdAt)}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tooltip
            label="Already the head"
            disabled={!isHead}
            withArrow
            position="top"
          >
            <Button
              size="xs"
              variant="default"
              onClick={handleRevert}
              disabled={isHead}
              data-testid={`history-row-revert-${version.id}`}
            >
              Revert to this version
            </Button>
          </Tooltip>
          <Tooltip
            label="This is the head — nothing to compare"
            disabled={!isHead}
            withArrow
            position="top"
          >
            <Button
              size="xs"
              variant="default"
              onClick={handleCompare}
              disabled={isHead}
              data-testid={`history-row-compare-${version.id}`}
            >
              Compare to head
            </Button>
          </Tooltip>
        </Group>
      </Stack>
    </Card>
  );
}
