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

import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowMerge,
  IconArrowsSplit,
  IconExternalLink,
  IconHandStop,
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
import {
  CONTROL_FLOW_PALETTE_ENTRIES,
  type ControlFlowPaletteEntry,
} from "./control-flow-palette-entries";
import type { ControlFlowNodeType } from "./control-flow-skeletons";

interface ActivityPaletteProps {
  /** Adds a fresh activity instance to the canvas. */
  onAddActivity: (activityType: string) => void;
  /** Adds a fresh skeleton for the given control-flow node type. */
  onAddControlFlowNode: (type: ControlFlowNodeType) => void;
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

export function ActivityPalette({
  onAddActivity,
  onAddControlFlowNode,
}: ActivityPaletteProps) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => getCatalogByCategory(), []);

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
    filteredControlFlowEntries.length === 0 && filteredCategories.length === 0;

  return (
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
