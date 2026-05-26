/**
 * Left-rail palette for the visual editor.
 *
 * Two top-level sections:
 *   1. "Flow Control" — hard-coded list of the six control-flow node
 *      types (`CONTROL_FLOW_PALETTE_ENTRIES`). Clicking an entry asks
 *      the host to add a freshly-built skeleton of the corresponding
 *      type to `config.nodes`. Control-flow types are NOT activities
 *      and intentionally do not live in `ACTIVITY_CATALOG`.
 *   2. The activity categories sourced from the shared catalog
 *      (`getCatalogByCategory`).
 *
 * Click an entry to add the node to the canvas — drag-to-canvas is
 * planned for Phase 1A polish, click-to-add is the click-first
 * interaction agreed with the designer.
 */

import { SOURCE_CATALOG } from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowMerge,
  IconArrowsSplit,
  IconCode,
  IconExternalLink,
  IconHandStop,
  IconPlus,
  IconRefresh,
  IconRoute,
  IconSearch,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import {
  CATEGORY_ORDER,
  getActivityVisualHints,
  getCatalogByCategory,
} from "../catalog-utils";
import { DynamicNodeEditor, useActivityCatalog } from "../dynamic-nodes";
import { getSourceVisualHints } from "../sources/source-catalog-utils";
import {
  CONTROL_FLOW_PALETTE_ENTRIES,
  type ControlFlowPaletteEntry,
} from "./control-flow-palette-entries";
import type { ControlFlowNodeType } from "./control-flow-skeletons";
import {
  type DynamicPaletteEntry,
  selectDynamicPaletteEntries,
} from "./usePaletteSections";

interface ActivityPaletteProps {
  /** Adds a fresh activity instance to the canvas. */
  onAddActivity: (activityType: string) => void;
  /** Adds a fresh skeleton for the given control-flow node type. */
  onAddControlFlowNode: (type: ControlFlowNodeType) => void;
  /**
   * Adds a fresh `SourceNode` skeleton for the given subtype (US-118).
   * The host calls `getSourceCatalogEntry` + `entry.parametersSchema.parse({})`
   * to fill in the catalog defaults.
   */
  onAddSource: (sourceType: string) => void;
  /**
   * Adds a fresh dynamic-node instance (`type: "dyn.<slug>"`) to the
   * canvas (Phase 6 US-182). The host looks up the catalog entry by
   * `dyn.<slug>` activity type, derives defaults from its
   * `paramsSchema`, and inserts an `ActivityNode` at the next free
   * position. Called from:
   *   - the "Custom" section row's click handler (drop an existing dyn)
   *   - the "+ New custom node" modal's onAfterPublish callback (drop
   *     the freshly-authored lineage as its first canvas instance)
   */
  onAddDynamicNode: (slug: string) => void;
}

interface TablerIconProps {
  size?: number | string;
}

const CONTROL_FLOW_ICONS: Record<string, ComponentType<TablerIconProps>> = {
  switch: IconRoute,
  map: IconArrowsSplit,
  join: IconArrowMerge,
  childWorkflow: IconExternalLink,
  pollUntil: IconRefresh,
  humanGate: IconHandStop,
};

const CONTROL_FLOW_SECTION_LABEL = "Flow Control";
const SOURCES_SECTION_LABEL = "Sources";
const CUSTOM_SECTION_LABEL = "Custom";

export function ActivityPalette({
  onAddActivity,
  onAddControlFlowNode,
  onAddSource,
  onAddDynamicNode,
}: ActivityPaletteProps) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => getCatalogByCategory(), []);
  const catalog = useActivityCatalog();
  const [newDynamicOpen, setNewDynamicOpen] = useState(false);

  const dynamicEntries = useMemo<DynamicPaletteEntry[]>(
    () => selectDynamicPaletteEntries(catalog.entries),
    [catalog.entries],
  );

  const filteredDynamicEntries = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return dynamicEntries;
    return dynamicEntries.filter(
      (e) =>
        e.displayName.toLowerCase().includes(lower) ||
        e.dynamicNodeSlug.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower),
    );
  }, [dynamicEntries, query]);

  const filteredSourceEntries = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return SOURCE_CATALOG;
    return SOURCE_CATALOG.filter(
      (e) =>
        e.displayName.toLowerCase().includes(lower) ||
        e.type.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower),
    );
  }, [query]);

  const filteredControlFlowEntries = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return CONTROL_FLOW_PALETTE_ENTRIES;
    return CONTROL_FLOW_PALETTE_ENTRIES.filter(
      (e) =>
        e.displayName.toLowerCase().includes(lower) ||
        e.type.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower),
    );
  }, [query]);

  const filteredCategories = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const out: Array<{
      category: string;
      entries: ReturnType<typeof getCatalogByCategory>[string];
    }> = [];
    for (const cat of CATEGORY_ORDER) {
      // The hard-coded Flow Control section above renders its own list;
      // skip the (empty) catalog category of the same name to avoid a
      // duplicate header.
      if (cat === CONTROL_FLOW_SECTION_LABEL) continue;
      const all = grouped[cat] ?? [];
      const entries = lower
        ? all.filter(
            (e) =>
              e.displayName.toLowerCase().includes(lower) ||
              e.activityType.toLowerCase().includes(lower) ||
              e.description.toLowerCase().includes(lower),
          )
        : all;
      if (entries.length > 0) out.push({ category: cat, entries });
    }
    return out;
  }, [grouped, query]);

  const totalCount = useMemo(
    () =>
      Object.values(grouped).reduce((sum, entries) => sum + entries.length, 0),
    [grouped],
  );

  const nothingMatchesQuery =
    filteredSourceEntries.length === 0 &&
    filteredControlFlowEntries.length === 0 &&
    filteredCategories.length === 0 &&
    filteredDynamicEntries.length === 0;

  return (
    <>
      <Stack
        gap="sm"
        p="sm"
        style={{
          height: "100%",
          borderRight: "1px solid var(--mantine-color-default-border, #2c2e33)",
          background: "var(--mantine-color-body, #1a1b1e)",
          minWidth: 240,
          maxWidth: 280,
          width: 280,
        }}
      >
        <Box>
          <Text fw={600} size="sm">
            Activity palette
          </Text>
          <Text size="xs" c="dimmed">
            {totalCount} activities — click to add
          </Text>
        </Box>
        <TextInput
          placeholder="Search activities..."
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          size="xs"
        />
        <ScrollArea style={{ flex: 1 }} type="auto">
          <Stack gap="md">
            <Stack key={SOURCES_SECTION_LABEL} gap={4}>
              <Text
                size="xs"
                fw={600}
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: 0.4 }}
              >
                {SOURCES_SECTION_LABEL}
              </Text>
              {filteredSourceEntries.length === 0 ? (
                <Text
                  size="10px"
                  c="dimmed"
                  data-testid="sources-empty-placeholder"
                >
                  {SOURCE_CATALOG.length === 0
                    ? "No source types available"
                    : `No sources match "${query}"`}
                </Text>
              ) : (
                filteredSourceEntries.map((entry) => (
                  <SourcePaletteRow
                    key={entry.type}
                    sourceType={entry.type}
                    displayName={entry.displayName}
                    description={entry.description}
                    onClick={() => onAddSource(entry.type)}
                  />
                ))
              )}
            </Stack>
            {filteredControlFlowEntries.length > 0 && (
              <Stack key={CONTROL_FLOW_SECTION_LABEL} gap={4}>
                <Text
                  size="xs"
                  fw={600}
                  c="dimmed"
                  tt="uppercase"
                  style={{ letterSpacing: 0.4 }}
                >
                  {CONTROL_FLOW_SECTION_LABEL}
                </Text>
                {filteredControlFlowEntries.map((entry) => (
                  <ControlFlowPaletteRow
                    key={entry.type}
                    entry={entry}
                    onClick={() => onAddControlFlowNode(entry.type)}
                  />
                ))}
              </Stack>
            )}
            <Stack key={CUSTOM_SECTION_LABEL} gap={4}>
              <Text
                size="xs"
                fw={600}
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: 0.4 }}
              >
                {CUSTOM_SECTION_LABEL}
              </Text>
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() => setNewDynamicOpen(true)}
                data-testid="palette-custom-new-btn"
              >
                + New custom node
              </Button>
              {filteredDynamicEntries.length === 0 ? (
                <Text
                  size="10px"
                  c="dimmed"
                  data-testid="custom-empty-placeholder"
                >
                  {dynamicEntries.length === 0
                    ? "No custom nodes yet"
                    : `No custom nodes match "${query}"`}
                </Text>
              ) : (
                filteredDynamicEntries.map((entry) => (
                  <DynamicPaletteRow
                    key={entry.activityType}
                    entry={entry}
                    onClick={() => onAddDynamicNode(entry.dynamicNodeSlug)}
                  />
                ))
              )}
            </Stack>
            {filteredCategories.map(({ category, entries }) => (
              <Stack key={category} gap={4}>
                <Text
                  size="xs"
                  fw={600}
                  c="dimmed"
                  tt="uppercase"
                  style={{ letterSpacing: 0.4 }}
                >
                  {category}
                </Text>
                {entries.map((entry) => {
                  const hints = getActivityVisualHints(entry.activityType);
                  return (
                    <Tooltip
                      key={entry.activityType}
                      label={entry.description}
                      multiline
                      w={260}
                      withArrow
                      position="right"
                      openDelay={400}
                    >
                      <Group
                        gap="xs"
                        wrap="nowrap"
                        onClick={() => onAddActivity(entry.activityType)}
                        style={{
                          cursor: "pointer",
                          padding: "6px 8px",
                          borderRadius: 6,
                          borderLeftWidth: 3,
                          borderLeftStyle: "solid",
                          borderLeftColor: hints.color,
                          background:
                            "var(--mantine-color-default-hover, #25262b)",
                        }}
                      >
                        <ActionIcon
                          variant="transparent"
                          color="gray"
                          size="sm"
                          style={{ pointerEvents: "none" }}
                        >
                          <span>{hints.icon}</span>
                        </ActionIcon>
                        <Box style={{ minWidth: 0, flex: 1 }}>
                          <Text size="xs" fw={500} truncate>
                            {entry.displayName}
                          </Text>
                          <Text size="10px" c="dimmed" ff="monospace" truncate>
                            {entry.activityType}
                          </Text>
                        </Box>
                      </Group>
                    </Tooltip>
                  );
                })}
              </Stack>
            ))}
            {nothingMatchesQuery && (
              <Text size="xs" c="dimmed" ta="center">
                No entries match "{query}".
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
      <Modal
        opened={newDynamicOpen}
        onClose={() => setNewDynamicOpen(false)}
        size="80%"
        title="New custom node"
        data-testid="palette-custom-new-modal"
      >
        <DynamicNodeEditor
          layout="modal"
          onAfterPublish={(publishedSlug) => {
            setNewDynamicOpen(false);
            onAddDynamicNode(publishedSlug);
          }}
          onClose={() => setNewDynamicOpen(false)}
        />
      </Modal>
    </>
  );
}

interface DynamicPaletteRowProps {
  entry: DynamicPaletteEntry;
  onClick: () => void;
}

function DynamicPaletteRow({ entry, onClick }: DynamicPaletteRowProps) {
  // Drag payload — `kind: "dynamic"` is the discriminator the canvas
  // drop handler (when wired) keys off when constructing the new
  // `ActivityNode` with `type: "dyn.<slug>"`. The click-to-add path is
  // the primary trigger; drag is here for parity with the source rows.
  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(
      "application/x-workflow-palette",
      JSON.stringify({
        kind: "dynamic",
        slug: entry.dynamicNodeSlug,
        activityType: entry.activityType,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <Tooltip
      label={entry.description || `Dynamic node: ${entry.dynamicNodeSlug}`}
      multiline
      w={260}
      withArrow
      position="right"
      openDelay={400}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        data-testid={`dynamic-palette-entry-${entry.dynamicNodeSlug}`}
        style={{
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 6,
          borderLeftWidth: 3,
          borderLeftStyle: "solid",
          borderLeftColor: "#9333ea",
          background: "var(--mantine-color-default-hover, #25262b)",
        }}
      >
        <ActionIcon
          variant="transparent"
          color="grape"
          size="sm"
          style={{ pointerEvents: "none" }}
          aria-hidden
        >
          <IconCode size={16} />
        </ActionIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" fw={500} truncate>
            {entry.displayName}
          </Text>
          <Text size="10px" c="dimmed" ff="monospace" truncate>
            {entry.activityType}
          </Text>
        </Box>
        <Badge
          size="xs"
          variant="filled"
          color="grape"
          data-testid={`dynamic-palette-entry-pill-${entry.dynamicNodeSlug}`}
        >
          DYN
        </Badge>
      </Group>
    </Tooltip>
  );
}

interface SourcePaletteRowProps {
  sourceType: string;
  displayName: string;
  description: string;
  onClick: () => void;
}

function SourcePaletteRow({
  sourceType,
  displayName,
  description,
  onClick,
}: SourcePaletteRowProps) {
  // Resolve via the shared utils so palette + canvas + settings stay in
  // sync. Falls back to gray + IconDatabase when the catalog hints are
  // missing.
  const hints = getSourceVisualHints(sourceType);
  const accent = hints.color;
  const Icon = hints.Icon;
  // Drag payload — `kind: "source"` is the discriminator the
  // `WorkflowEditorCanvas` drop handler keys off when constructing the
  // new `SourceNode`. Mirrors the implicit contract the activity /
  // control-flow rows use today (click-to-add via `onClick`); the drop
  // handler is wired in the same milestone for completeness.
  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(
      "application/x-workflow-palette",
      JSON.stringify({ kind: "source", sourceType }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <Tooltip
      label={description}
      multiline
      w={260}
      withArrow
      position="right"
      openDelay={400}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        data-testid={`source-palette-entry-${sourceType}`}
        style={{
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 6,
          borderLeftWidth: 3,
          borderLeftStyle: "solid",
          borderLeftColor: accent,
          background: "var(--mantine-color-default-hover, #25262b)",
        }}
      >
        <ActionIcon
          variant="transparent"
          color="gray"
          size="sm"
          style={{ pointerEvents: "none" }}
          aria-hidden
        >
          <Icon size={16} />
        </ActionIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" fw={500} truncate>
            {displayName}
          </Text>
          <Text size="10px" c="dimmed" ff="monospace" truncate>
            {sourceType}
          </Text>
        </Box>
      </Group>
    </Tooltip>
  );
}

interface ControlFlowPaletteRowProps {
  entry: ControlFlowPaletteEntry;
  onClick: () => void;
}

function ControlFlowPaletteRow({ entry, onClick }: ControlFlowPaletteRowProps) {
  const Icon = CONTROL_FLOW_ICONS[entry.type];
  return (
    <Tooltip
      label={entry.description}
      multiline
      w={260}
      withArrow
      position="right"
      openDelay={400}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        onClick={onClick}
        data-testid={`control-flow-palette-entry-${entry.type}`}
        style={{
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 6,
          borderLeftWidth: 3,
          borderLeftStyle: "solid",
          borderLeftColor: "#8b5cf6",
          background: "var(--mantine-color-default-hover, #25262b)",
        }}
      >
        <ActionIcon
          variant="transparent"
          color="violet"
          size="sm"
          style={{ pointerEvents: "none" }}
          aria-hidden
        >
          {Icon ? <Icon size={16} /> : null}
        </ActionIcon>
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="xs" fw={500} truncate>
            {entry.displayName}
          </Text>
          <Text size="10px" c="dimmed" ff="monospace" truncate>
            {entry.type}
          </Text>
        </Box>
      </Group>
    </Tooltip>
  );
}
