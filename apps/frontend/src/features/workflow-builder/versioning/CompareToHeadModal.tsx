/**
 * Compare-to-head modal (Phase 2 Track 3 — US-084; diff view added for D31).
 *
 * Opens from `VersionHistoryDrawer`'s per-row "Compare to head" button.
 *
 * The default tab is a **structural diff**: every leaf of the two configs
 * compared field by field, changed/added/removed called out, unchanged fields
 * collapsed behind a disclosure. The original two-full-JSON view is still
 * here as the second tab, because "show me the whole thing" is a real need —
 * it is just no longer the only thing on offer, which is what the reviewer
 * asked for ("could be clearer if it showed an actual diff, not just both
 * versions in full").
 *
 * Left = the selected (older) version's config (fetched via
 * `useWorkflowVersion`), right = the current head's config (passed in from
 * the editor page's already-loaded `useWorkflow(lineageId)` — no extra fetch).
 */

import {
  Alert,
  Badge,
  Box,
  Code,
  Collapse,
  Group,
  JsonInput,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useMemo, useState } from "react";
import {
  useWorkflowVersion,
  useWorkflowVersions,
  type WorkflowInfo,
} from "../../../data/hooks/useWorkflows";
import {
  type ConfigDiffEntry,
  DERIVED_PATHS,
  describeDiff,
  diffConfigs,
  summariseDiff,
} from "./config-diff";

export interface CompareToHeadModalProps {
  opened: boolean;
  onClose: () => void;
  lineageId: string;
  /** The non-head version being compared against head. */
  selectedVersionId: string;
  selectedVersionNumber: number;
  /** ISO timestamp string for the selected version. */
  selectedCreatedAt: string;
  /** Already-loaded head WorkflowInfo — reused from `useWorkflow`. */
  headWorkflow: WorkflowInfo;
}

export function CompareToHeadModal({
  opened,
  onClose,
  lineageId,
  selectedVersionId,
  selectedVersionNumber,
  selectedCreatedAt,
  headWorkflow,
}: CompareToHeadModalProps) {
  const versionQuery = useWorkflowVersion(lineageId, selectedVersionId);

  // `headWorkflow.createdAt` maps from the lineage's `created_at` (when the
  // lineage was first created), NOT the head version's timestamp. Resolve
  // the head VERSION's `created_at` from the version summaries by matching
  // on the head version number (Item 33). Falls back to the lineage
  // timestamp while the summaries are still loading.
  const versionsQuery = useWorkflowVersions(lineageId);
  const headVersionCreatedAt =
    versionsQuery.data?.find((s) => s.versionNumber === headWorkflow.version)
      ?.createdAt ?? headWorkflow.createdAt;

  const headConfigJson = JSON.stringify(headWorkflow.config, null, 2);
  const selectedConfig = versionQuery.data?.config;

  const entries = useMemo(
    () =>
      selectedConfig
        ? diffConfigs(selectedConfig, headWorkflow.config)
        : ([] as ConfigDiffEntry[]),
    [selectedConfig, headWorkflow.config],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="80%"
      title={`Compare v${selectedVersionNumber} to head (v${headWorkflow.version})`}
      data-testid="compare-to-head-modal"
    >
      <Tabs defaultValue="diff" keepMounted>
        <Tabs.List mb="md">
          <Tabs.Tab value="diff" data-testid="compare-tab-diff">
            Changes
          </Tabs.Tab>
          <Tabs.Tab value="full" data-testid="compare-tab-full">
            Both versions in full
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="diff" data-testid="compare-diff-panel">
          {versionQuery.isLoading && (
            <Skeleton h={400} data-testid="compare-diff-skeleton" />
          )}
          {versionQuery.isError && (
            <Alert
              color="red"
              title="Failed to load version"
              data-testid="compare-diff-error"
            >
              {versionQuery.error instanceof Error
                ? versionQuery.error.message
                : "Unknown error"}
            </Alert>
          )}
          {selectedConfig && (
            <ConfigDiff
              entries={entries}
              leftLabel={`v${selectedVersionNumber}`}
              rightLabel={`head (v${headWorkflow.version})`}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="full" data-testid="compare-full-panel">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="xs" data-testid="compare-left-column">
              <Text fw={500}>
                v{selectedVersionNumber} — {selectedCreatedAt}
              </Text>
              {versionQuery.isLoading && (
                <Skeleton h={400} data-testid="compare-left-skeleton" />
              )}
              {versionQuery.isError && (
                <Alert
                  color="red"
                  title="Failed to load version"
                  data-testid="compare-left-error"
                >
                  {versionQuery.error instanceof Error
                    ? versionQuery.error.message
                    : "Unknown error"}
                </Alert>
              )}
              {versionQuery.data && (
                <JsonInput
                  value={JSON.stringify(versionQuery.data.config, null, 2)}
                  readOnly
                  autosize
                  maxRows={40}
                  formatOnBlur={false}
                  data-testid="compare-left-json"
                />
              )}
            </Stack>
            <Stack gap="xs" data-testid="compare-right-column">
              <Text fw={500}>
                head (v{headWorkflow.version} — {headVersionCreatedAt})
              </Text>
              <JsonInput
                value={headConfigJson}
                readOnly
                autosize
                maxRows={40}
                formatOnBlur={false}
                data-testid="compare-right-json"
              />
            </Stack>
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

const KIND_STYLE: Record<
  "added" | "removed" | "changed",
  { color: string; label: string }
> = {
  changed: { color: "yellow", label: "changed" },
  added: { color: "green", label: "added in head" },
  removed: { color: "red", label: "removed in head" },
};

interface ConfigDiffProps {
  entries: ConfigDiffEntry[];
  leftLabel: string;
  rightLabel: string;
}

/**
 * Renders the diff: differences first and always visible, unchanged fields
 * behind a disclosure so they are available without being what you read.
 */
export function ConfigDiff({
  entries,
  leftLabel,
  rightLabel,
}: ConfigDiffProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const summary = summariseDiff(entries);
  const differences = entries.filter((e) => e.kind !== "unchanged");
  const unchanged = entries.filter((e) => e.kind === "unchanged");

  return (
    <Stack gap="sm" data-testid="config-diff">
      <Text size="sm" c="dimmed" data-testid="config-diff-summary">
        {describeDiff(summary)}
      </Text>

      <Text size="xs" c="dimmed" data-testid="config-diff-footnote">
        {DERIVED_PATHS.join(", ")} is computed from the rest of the config on
        every save, so it is left out of this comparison.
      </Text>

      {differences.length === 0 ? (
        <Alert color="blue" data-testid="config-diff-identical">
          These two versions have identical configs. A version can be saved when
          only the name or description changed, which is one way this happens.
        </Alert>
      ) : (
        <Stack gap="xs" data-testid="config-diff-changes">
          {differences.map((entry) => (
            <DiffRow
              key={entry.path}
              entry={entry}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
            />
          ))}
        </Stack>
      )}

      {unchanged.length > 0 && (
        <Box>
          <UnstyledButton
            onClick={() => setShowUnchanged((v) => !v)}
            data-testid="config-diff-toggle-unchanged"
          >
            <Text size="sm" c="blue">
              {showUnchanged ? "Hide" : "Show"} {unchanged.length} unchanged
              field{unchanged.length === 1 ? "" : "s"}
            </Text>
          </UnstyledButton>
          <Collapse in={showUnchanged}>
            <Stack gap={4} mt="xs" data-testid="config-diff-unchanged">
              {unchanged.map((entry) => (
                <Group key={entry.path} gap="xs" wrap="nowrap" align="start">
                  <Code data-testid="config-diff-unchanged-path">
                    {entry.path}
                  </Code>
                  <Text size="xs" c="dimmed" style={{ wordBreak: "break-all" }}>
                    {entry.left}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Stack>
  );
}

function DiffRow({
  entry,
  leftLabel,
  rightLabel,
}: {
  entry: ConfigDiffEntry;
  leftLabel: string;
  rightLabel: string;
}) {
  const style = KIND_STYLE[entry.kind as "added" | "removed" | "changed"];
  return (
    <Box
      p="xs"
      style={{
        borderLeft: `3px solid var(--mantine-color-${style.color}-6)`,
        background: "var(--mantine-color-gray-0)",
      }}
      data-testid={`config-diff-row-${entry.kind}`}
    >
      <Group gap="xs" wrap="nowrap" mb={4}>
        <Badge size="xs" color={style.color} variant="light">
          {style.label}
        </Badge>
        <Code data-testid="config-diff-path">{entry.path}</Code>
      </Group>
      {entry.left !== undefined && (
        <Text size="xs" style={{ wordBreak: "break-all" }}>
          <Text span c="dimmed">
            {leftLabel}:{" "}
          </Text>
          <Text span c={entry.kind === "added" ? undefined : "red.8"}>
            {entry.left}
          </Text>
        </Text>
      )}
      {entry.right !== undefined && (
        <Text size="xs" style={{ wordBreak: "break-all" }}>
          <Text span c="dimmed">
            {rightLabel}:{" "}
          </Text>
          <Text span c={entry.kind === "removed" ? undefined : "green.9"}>
            {entry.right}
          </Text>
        </Text>
      )}
    </Box>
  );
}
