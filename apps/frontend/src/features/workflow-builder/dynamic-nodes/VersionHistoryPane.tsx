/**
 * `VersionHistoryPane` — newest-first version list + view modal + revert
 * flow (Phase 6 US-179 / REQUIREMENTS L41).
 *
 * Mirrors the Phase 2 Track 3 `VersionHistoryDrawer` shape — list rows
 * with a `v{n}` indigo badge + relative timestamp + optional blue head
 * badge + per-row View / Revert buttons. View opens a `<Modal size="80%">`
 * with two `<JsonInput readOnly>` blocks side-by-side (selected on the
 * left, head on the right — same pattern as `CompareToHeadModal`,
 * deliberately not a diff library).
 *
 * Revert opens `modals.openConfirmModal`. On confirm, the pane calls the
 * publish mutation passed in via `onRevert(version)` with the selected
 * version's script; the publish hook's invalidation chain refetches the
 * version history automatically, so the "head" badge slides to the new
 * row on the next render.
 *
 * Create-mode (no slug yet) renders a gray "publish to create v1"
 * placeholder. Loading shows three Skeleton rows; error renders a red
 * `<Alert>`.
 */

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  JsonInput,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useMemo, useState } from "react";
import type { ApiError } from "../sources/useSourceUpload";
import type { DynamicNodeVersionDetail } from "./dynamic-node-api";

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

export interface VersionHistoryPaneProps {
  /** Undefined in create-mode (`slug` not yet known). */
  slug?: string;
  /** True while `useDynamicNode(slug)` is in-flight (edit-mode only). */
  isLoading?: boolean;
  error?: ApiError | null;
  /** Newest-first version list. Pass `[]` in create-mode. */
  versions: DynamicNodeVersionDetail[];
  /** Version number of the current head (matches `headVersion.versionNumber`). */
  headVersionNumber?: number;
  /**
   * Called when the user confirms a revert. Receives the selected
   * version. The host is responsible for calling
   * `useDynamicNodePublish` with `{ slug, script: version.script }` —
   * keeping the mutation wiring in the shell.
   */
  onRevert?: (version: DynamicNodeVersionDetail) => void;
}

export function VersionHistoryPane({
  slug,
  isLoading,
  error,
  versions,
  headVersionNumber,
  onRevert,
}: VersionHistoryPaneProps) {
  const [viewModalOpened, viewModalControls] = useDisclosure(false);
  const [selectedVersion, setSelectedVersion] =
    useState<DynamicNodeVersionDetail | null>(null);

  const headVersion = useMemo(
    () =>
      versions.find((v) => v.versionNumber === headVersionNumber) ??
      versions[0] ??
      null,
    [versions, headVersionNumber],
  );

  if (slug === undefined) {
    return (
      <Text
        size="sm"
        c="dimmed"
        data-testid="version-history-empty-create"
        p="md"
      >
        No versions yet — publish to create v1.
      </Text>
    );
  }

  if (isLoading) {
    return (
      <Stack gap="xs" data-testid="version-history-loading">
        <Skeleton height={64} radius="sm" />
        <Skeleton height={64} radius="sm" />
        <Skeleton height={64} radius="sm" />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        color="red"
        title="Failed to load versions"
        data-testid="version-history-error"
      >
        {error.message}
      </Alert>
    );
  }

  const handleView = (version: DynamicNodeVersionDetail) => {
    setSelectedVersion(version);
    viewModalControls.open();
  };

  const handleRevert = (version: DynamicNodeVersionDetail) => {
    if (!onRevert) return;
    const targetVersionNumber = version.versionNumber;
    const newHeadNumber =
      (headVersion?.versionNumber ?? targetVersionNumber) + 1;
    modals.openConfirmModal({
      title: `Revert to v${targetVersionNumber}?`,
      children: (
        <Text size="sm">
          Reverting will publish v{targetVersionNumber}'s script as the new head
          (v{newHeadNumber}). Continue?
        </Text>
      ),
      labels: { confirm: "Revert", cancel: "Cancel" },
      confirmProps: {
        color: "blue",
        "data-testid": "version-history-revert-confirm",
      },
      cancelProps: { "data-testid": "version-history-revert-cancel" },
      onConfirm: () => onRevert(version),
    });
  };

  return (
    <>
      <Stack gap="sm" data-testid="version-history-list">
        {versions.map((version) => {
          const isHead = version.versionNumber === headVersion?.versionNumber;
          return (
            <Card
              key={version.versionNumber}
              withBorder
              padding="sm"
              radius="sm"
              data-testid={`version-history-row-${version.versionNumber}`}
            >
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Badge color="indigo" variant="light">
                      v{version.versionNumber}
                    </Badge>
                    {isHead && (
                      <Badge
                        color="blue"
                        data-testid={`version-history-head-badge-${version.versionNumber}`}
                      >
                        head
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {formatTimestamp(version.publishedAt)}
                  </Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  <Tooltip
                    label="This is the head"
                    disabled={!isHead}
                    withArrow
                    position="top"
                  >
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => handleView(version)}
                      disabled={isHead}
                      data-testid={`version-history-view-${version.versionNumber}`}
                    >
                      View
                    </Button>
                  </Tooltip>
                  <Tooltip
                    label="This is the head"
                    disabled={!isHead}
                    withArrow
                    position="top"
                  >
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => handleRevert(version)}
                      disabled={isHead}
                      data-testid={`version-history-revert-${version.versionNumber}`}
                    >
                      Revert
                    </Button>
                  </Tooltip>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      <Modal
        opened={viewModalOpened}
        onClose={viewModalControls.close}
        size="80%"
        title={
          selectedVersion
            ? `Compare v${selectedVersion.versionNumber} to head`
            : "Compare to head"
        }
        data-testid="version-history-view-modal"
      >
        {selectedVersion && headVersion && (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="xs" data-testid="version-history-view-left">
              <Text fw={500}>
                v{selectedVersion.versionNumber} —{" "}
                {formatTimestamp(selectedVersion.publishedAt)}
              </Text>
              <JsonInput
                value={selectedVersion.script}
                readOnly
                autosize
                maxRows={40}
                formatOnBlur={false}
                data-testid="version-history-view-left-json"
              />
            </Stack>
            <Stack gap="xs" data-testid="version-history-view-right">
              <Text fw={500}>
                head (v{headVersion.versionNumber} —{" "}
                {formatTimestamp(headVersion.publishedAt)})
              </Text>
              <JsonInput
                value={headVersion.script}
                readOnly
                autosize
                maxRows={40}
                formatOnBlur={false}
                data-testid="version-history-view-right-json"
              />
            </Stack>
          </SimpleGrid>
        )}
      </Modal>
    </>
  );
}
