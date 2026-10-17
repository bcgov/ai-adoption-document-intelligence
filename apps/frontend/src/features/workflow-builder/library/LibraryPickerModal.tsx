/**
 * LibraryPickerModal — counterpart to TemplatesPickerModal for picking
 * a library workflow (US-062). Fetches via `useWorkflows({ kind:
 * "library" })` (which calls `GET /api/workflows?kind=library`), lists
 * each library workflow with its declared signature, and emits the
 * picked selection (workflowId + optional pinned version number) to
 * the host via `onSelect`.
 *
 * Wired into `ChildWorkflowNodeSettings` (US-063) — replaces the
 * free-text `workflowId` TextInput on the library branch of
 * `workflowRef`. As of US-086 the modal also exposes a "Version"
 * `<Select>` so the author can pin a specific `WorkflowVersion.versionNumber`
 * at pick time (default = "head", which omits `version` from the
 * returned selection so the parent workflow resolves the library's
 * head at execution time — per REQUIREMENTS D3).
 */

import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkflowInfo } from "../../../data/hooks/useWorkflows";
import {
  useWorkflows,
  useWorkflowVersions,
} from "../../../data/hooks/useWorkflows";
import type {
  GraphMetadata,
  KindRef,
  LibraryPortDescriptor,
} from "../../../types/workflow";
import { formatLibraryPortSummary } from "./format-library-port-summary";
import { isLibraryCompatibleWithUpstream } from "./library-compat";

/**
 * Sentinel used by the Version `<Select>` to represent "no explicit pin —
 * resolve to head at runtime". Kept as a string (not `WorkflowVersion.id`)
 * so it can never collide with a real version id.
 */
const HEAD_VERSION_VALUE = "head";

export interface LibraryPickerSelection {
  workflowId: string;
  /**
   * Optional pinned `WorkflowVersion.versionNumber`. Omitted (not set to
   * `undefined`) when the user leaves the Version Select at "head".
   */
  version?: number;
}

export interface LibraryPickerModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (selection: LibraryPickerSelection) => void;
  /**
   * Pre-seed: the lineage id of the library row to pre-highlight when the
   * modal opens. Used by `ChildWorkflowNodeSettings` "Change version"
   * (US-087) to re-open the picker against the already-pinned library
   * without making the author re-search.
   */
  initialWorkflowId?: string;
  /**
   * Pre-seed: the pinned `WorkflowVersion.versionNumber` to set the
   * Version Select to once the versions list loads. `undefined` means
   * "head" (matches the on-disk shape — absence === head).
   */
  initialVersion?: number;
  /**
   * Optional upstream producer kind for compat filtering (US-100 Scenario 4).
   *
   * When provided, libraries whose FIRST input's `kind` is assignable from
   * this kind appear in a "Compatible" group at the top; everything else
   * (including legacy libraries with no typed inputs) lands below an
   * `"Other libraries"` divider, dimmed at ~50% opacity. Clicking any row
   * still works — there is no hard rejection (mirrors US-097's picker UX).
   *
   * When omitted, the picker renders all libraries un-grouped (legacy
   * behaviour — Scenario 3).
   */
  expectedFirstInputKind?: KindRef;
}

export function LibraryPickerModal({
  opened,
  onClose,
  onSelect,
  initialWorkflowId,
  initialVersion,
  expectedFirstInputKind,
}: LibraryPickerModalProps) {
  const { data, isLoading, isError, error, refetch } = useWorkflows({
    kind: "library",
  });
  const [query, setQuery] = useState("");
  const [selectedLibrary, setSelectedLibrary] = useState<WorkflowInfo | null>(
    null,
  );
  const [selectedVersion, setSelectedVersion] =
    useState<string>(HEAD_VERSION_VALUE);

  const libraries = data ?? [];

  /**
   * Pre-seed the highlighted library row from `initialWorkflowId` once the
   * libraries list resolves. Only fires when the modal opens with a
   * pre-seed and the user hasn't yet chosen a different row themselves —
   * we run this only while `selectedLibrary` is null so a deliberate user
   * pick during the same open session is not overwritten.
   */
  useEffect(() => {
    if (!opened) return;
    if (!initialWorkflowId) return;
    if (selectedLibrary) return;
    const match = libraries.find((wf) => wf.id === initialWorkflowId);
    if (match) {
      setSelectedLibrary(match);
    }
  }, [opened, initialWorkflowId, libraries, selectedLibrary]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return libraries;
    return libraries.filter((wf) => {
      if (wf.name.toLowerCase().includes(q)) return true;
      if (wf.description?.toLowerCase().includes(q)) return true;
      if (wf.slug.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [libraries, query]);

  /**
   * When `expectedFirstInputKind` is provided, split the filtered libraries
   * into compatible-first / other-second buckets (US-100 Scenario 4).
   *
   * "Other" includes both:
   *   - libraries whose first input's kind is NOT assignable from the
   *     upstream producer's kind, AND
   *   - legacy libraries with NO typed signatures (no inputs declared, or
   *     first input lacks a `kind`). The picker can't verify their compat,
   *     so they're honestly surfaced as "Other" rather than confidently
   *     promoted to the top.
   *
   * When `expectedFirstInputKind` is undefined, both buckets collapse so
   * the picker renders the legacy flat list (Scenario 3).
   */
  const { compatibleLibraries, otherLibraries } = useMemo(() => {
    if (expectedFirstInputKind === undefined) {
      return {
        compatibleLibraries: filtered,
        otherLibraries: [] as WorkflowInfo[],
      };
    }
    const compat: WorkflowInfo[] = [];
    const other: WorkflowInfo[] = [];
    for (const wf of filtered) {
      const metadata = wf.config.metadata as GraphMetadata | undefined;
      const inputs: LibraryPortDescriptor[] = metadata?.inputs ?? [];
      // Legacy libraries (no typed signatures at all) are unverifiable,
      // so they go in "Other" — even though `isLibraryCompatibleWithUpstream`
      // would let them through via the `Artifact` wildcard.
      const hasTypedFirstInput =
        inputs.length > 0 && inputs[0]?.kind !== undefined;
      if (
        hasTypedFirstInput &&
        isLibraryCompatibleWithUpstream(inputs, expectedFirstInputKind)
      ) {
        compat.push(wf);
      } else {
        other.push(wf);
      }
    }
    return { compatibleLibraries: compat, otherLibraries: other };
  }, [filtered, expectedFirstInputKind]);

  const isGrouped = expectedFirstInputKind !== undefined;

  const versionsQuery = useWorkflowVersions(selectedLibrary?.id);
  const versions = versionsQuery.data ?? [];
  const versionsLoading = !!selectedLibrary && versionsQuery.isLoading;

  /**
   * Pre-seed the Version Select from `initialVersion` once the version
   * list has loaded for the pre-seeded library. Guard: only fires when
   * the pre-seeded library is the currently-selected one AND the select
   * is still at "head" (i.e. the user hasn't manually changed it during
   * this open session).
   */
  useEffect(() => {
    if (!opened) return;
    if (initialVersion === undefined) return;
    if (!selectedLibrary) return;
    if (selectedLibrary.id !== initialWorkflowId) return;
    if (selectedVersion !== HEAD_VERSION_VALUE) return;
    const match = versions.find((v) => v.versionNumber === initialVersion);
    if (match) {
      setSelectedVersion(match.id);
    }
  }, [
    opened,
    initialVersion,
    initialWorkflowId,
    selectedLibrary,
    selectedVersion,
    versions,
  ]);

  const versionSelectData = useMemo(() => {
    const headOption = { value: HEAD_VERSION_VALUE, label: "head" };
    const rest = versions.map((v) => ({
      value: v.id,
      label: `v${v.versionNumber}`,
    }));
    return [headOption, ...rest];
  }, [versions]);

  const handleSelectLibrary = (workflow: WorkflowInfo) => {
    setSelectedLibrary(workflow);
    setSelectedVersion(HEAD_VERSION_VALUE);
  };

  const handleConfirm = () => {
    if (!selectedLibrary) return;
    const selection: LibraryPickerSelection = {
      workflowId: selectedLibrary.id,
    };
    if (selectedVersion !== HEAD_VERSION_VALUE) {
      const matched = versions.find((v) => v.id === selectedVersion);
      if (matched) {
        // Build the object such that `version` is only ever present when a
        // real (non-head) version was picked. Conditionally assigning here
        // (rather than `selection.version = matched.versionNumber`) keeps
        // the key absent in the head case (Scenario 3b).
        selection.version = matched.versionNumber;
      }
    }
    onSelect(selection);
  };

  const handleClose = () => {
    setSelectedLibrary(null);
    setSelectedVersion(HEAD_VERSION_VALUE);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Pick library workflow"
      size="lg"
      centered
      data-testid="library-picker-modal"
    >
      <Stack gap="sm">
        <TextInput
          placeholder="Search libraries..."
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          size="sm"
          autoFocus
        />
        <ScrollArea style={{ maxHeight: 480 }} type="auto">
          {isLoading && (
            <Group justify="center" py="md">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Loading libraries…
              </Text>
            </Group>
          )}
          {isError && (
            <Stack align="center" py="md" gap="xs">
              <Text size="sm" c="red">
                Failed to load libraries:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
              </Text>
              <UnstyledButton
                onClick={() => refetch()}
                style={{
                  padding: "4px 8px",
                  border:
                    "1px solid var(--mantine-color-default-border, #2c2e33)",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                Retry
              </UnstyledButton>
            </Stack>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              {libraries.length === 0
                ? "No libraries yet — use “Save as library” from a workflow editor to create one."
                : `No libraries match "${query}".`}
            </Text>
          )}
          {!isLoading && !isError && filtered.length > 0 && (
            <Stack gap="xs">
              {compatibleLibraries.map((wf) => (
                <LibraryCard
                  key={wf.id}
                  workflow={wf}
                  selected={selectedLibrary?.id === wf.id}
                  onSelect={() => handleSelectLibrary(wf)}
                  dimmed={false}
                />
              ))}
              {isGrouped && otherLibraries.length > 0 && (
                <Divider
                  label="Other libraries"
                  labelPosition="center"
                  data-testid="library-picker-other-divider"
                />
              )}
              {otherLibraries.map((wf) => (
                <LibraryCard
                  key={wf.id}
                  workflow={wf}
                  selected={selectedLibrary?.id === wf.id}
                  onSelect={() => handleSelectLibrary(wf)}
                  dimmed={isGrouped}
                />
              ))}
            </Stack>
          )}
        </ScrollArea>

        {selectedLibrary && (
          <Group align="end" gap="xs" data-testid="library-picker-version-row">
            <Select
              label="Version"
              data={versionSelectData}
              value={selectedVersion}
              onChange={(value) =>
                setSelectedVersion(value ?? HEAD_VERSION_VALUE)
              }
              disabled={versionsLoading}
              allowDeselect={false}
              data-testid="library-picker-version-select"
              style={{ flex: 1 }}
              size="sm"
            />
            {versionsLoading && (
              <Loader size="xs" data-testid="library-picker-version-loader" />
            )}
          </Group>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selectedLibrary}
            onClick={handleConfirm}
            data-testid="library-picker-confirm"
          >
            Confirm
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface LibraryCardProps {
  workflow: WorkflowInfo;
  selected: boolean;
  onSelect: () => void;
  /**
   * Whether to render this row at ~50% opacity to signal "Other libraries"
   * — i.e. the library's first input is not assignable from the upstream
   * producer's kind. Clicking still works (no hard reject).
   */
  dimmed: boolean;
}

function LibraryCard({
  workflow,
  selected,
  onSelect,
  dimmed,
}: LibraryCardProps) {
  const metadata = workflow.config.metadata as GraphMetadata | undefined;
  const inputs: LibraryPortDescriptor[] = metadata?.inputs ?? [];
  const outputs: LibraryPortDescriptor[] = metadata?.outputs ?? [];

  return (
    <UnstyledButton
      onClick={onSelect}
      data-testid={`library-picker-card-${workflow.id}`}
      data-selected={selected ? "true" : "false"}
      data-dimmed={dimmed ? "true" : "false"}
      style={{
        borderRadius: 8,
        padding: "10px 12px",
        border: selected
          ? "1px solid var(--mantine-color-blue-6, #1c7ed6)"
          : "1px solid var(--mantine-color-default-border, #2c2e33)",
        background: selected
          ? "var(--mantine-color-blue-light, #1c7ed633)"
          : "var(--mantine-color-default, #1a1b1e)",
        cursor: "pointer",
        opacity: dimmed ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (selected) return;
        (e.currentTarget as HTMLElement).style.background =
          "var(--mantine-color-default-hover, #25262b)";
      }}
      onMouseLeave={(e) => {
        if (selected) return;
        (e.currentTarget as HTMLElement).style.background =
          "var(--mantine-color-default, #1a1b1e)";
      }}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text fw={600} size="sm" truncate>
            {workflow.name}
          </Text>
          <Group gap={6} wrap="nowrap">
            <Badge size="xs" variant="light" color="blue">
              {inputs.length} input{inputs.length === 1 ? "" : "s"}
            </Badge>
            <Badge size="xs" variant="light" color="grape">
              {outputs.length} output{outputs.length === 1 ? "" : "s"}
            </Badge>
          </Group>
        </Group>
        {workflow.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {workflow.description}
          </Text>
        )}
        {(inputs.length > 0 || outputs.length > 0) && (
          <Stack gap={2} mt={4}>
            {inputs.length > 0 && (
              <Text size="10px" c="dimmed">
                <strong>Inputs:</strong>{" "}
                {inputs.map(formatLibraryPortSummary).join(", ")}
              </Text>
            )}
            {outputs.length > 0 && (
              <Text size="10px" c="dimmed">
                <strong>Outputs:</strong>{" "}
                {outputs.map(formatLibraryPortSummary).join(", ")}
              </Text>
            )}
          </Stack>
        )}
        <Box>
          <Text size="10px" c="dimmed" ff="monospace">
            {workflow.slug} · {workflow.id}
          </Text>
        </Box>
      </Stack>
    </UnstyledButton>
  );
}
