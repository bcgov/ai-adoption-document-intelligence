/**
 * Hover-to-extend popover (US-045).
 *
 * Pops next to an outgoing source handle when the user hovers it; clicking
 * an entry adds the next node to the canvas + connects it to the source
 * in one move. The host wires the click callbacks to its own
 * `setConfig` + `fitView` flow — this component is purely presentational.
 *
 * The popover is anchored to a 1×1 invisible div pinned at fixed viewport
 * coordinates (same pattern as `NodeContextMenu`) and renders through
 * Mantine's portal so it can escape the xyflow scroll context's
 * `overflow: hidden`.
 *
 * Contents:
 *   - "Flow Control" section at the top with the six control-flow
 *     shortcuts.
 *   - Categorised activity list sourced from the shared catalog (same
 *     grouping the left-rail palette uses).
 *   - Search input at the top filters by displayName + activityType /
 *     control-flow type.
 *
 * `onMouseEnter` / `onMouseLeave` on the popover are forwarded to the
 * host through the `onMouseEnter` / `onMouseLeave` callbacks so the host
 * can cancel its 200ms close timer when the cursor leaves the handle but
 * enters the popover (hover-friendly behaviour from Scenario 2).
 */

import {
  ActionIcon,
  Box,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
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
} from "../palette/control-flow-palette-entries";
import type { ControlFlowNodeType } from "../palette/control-flow-skeletons";

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

export interface HoverExtendPopoverProps {
  /** Whether the popover is currently open. */
  opened: boolean;
  /** Viewport-relative position the popover pins to. */
  anchorPosition: { x: number; y: number };
  /** Fired when the popover should close (click-away or Escape). */
  onClose: () => void;
  /** User clicked an activity row — passes the activityType. */
  onPickActivity: (activityType: string) => void;
  /** User clicked a control-flow row — passes the control-flow type. */
  onPickControlFlow: (controlFlowType: ControlFlowNodeType) => void;
  /**
   * Optional hover-bridge callbacks — the host uses these to cancel /
   * re-arm its 200ms close timer when the cursor crosses from the handle
   * to the popover.
   */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HoverExtendPopover({
  opened,
  anchorPosition,
  onClose,
  onPickActivity,
  onPickControlFlow,
  onMouseEnter,
  onMouseLeave,
}: HoverExtendPopoverProps) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => getCatalogByCategory(), []);

  const filteredControlFlowEntries = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return CONTROL_FLOW_PALETTE_ENTRIES;
    return CONTROL_FLOW_PALETTE_ENTRIES.filter(
      (e) =>
        e.displayName.toLowerCase().includes(lower) ||
        e.type.toLowerCase().includes(lower),
    );
  }, [query]);

  const filteredCategories = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const out: Array<{
      category: string;
      entries: ReturnType<typeof getCatalogByCategory>[string];
    }> = [];
    for (const cat of CATEGORY_ORDER) {
      // Skip the (empty) catalog "Flow Control" category — the section
      // header above already covers the control-flow shortcuts.
      if (cat === CONTROL_FLOW_SECTION_LABEL) continue;
      const all = grouped[cat] ?? [];
      const entries = lower
        ? all.filter(
            (e) =>
              e.displayName.toLowerCase().includes(lower) ||
              e.activityType.toLowerCase().includes(lower),
          )
        : all;
      if (entries.length > 0) out.push({ category: cat, entries });
    }
    return out;
  }, [grouped, query]);

  const nothingMatchesQuery =
    filteredControlFlowEntries.length === 0 && filteredCategories.length === 0;

  return (
    <Popover
      opened={opened}
      onChange={(next) => {
        if (!next) onClose();
      }}
      position="right-start"
      withinPortal
      closeOnClickOutside
      closeOnEscape
      shadow="md"
      width={300}
      offset={4}
      // Skip the transition delay — under jsdom + fake timers the
      // dropdown can otherwise sit in a `mounting` state forever. The
      // popover is hover-driven, not a flashy reveal, so an immediate
      // open/close matches the desired snappy UX too.
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        {/*
         * Invisible anchor at fixed viewport coordinates. Mantine's
         * Popover needs a target ref for floating-positioning; a 1×1
         * fixed-position div is the simplest reliable trigger when the
         * popover has no on-page anchor element of its own.
         */}
        <div
          data-testid="hover-extend-anchor"
          style={{
            position: "fixed",
            left: `${anchorPosition.x}px`,
            top: `${anchorPosition.y}px`,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Popover.Target>
      <Popover.Dropdown
        data-testid="hover-extend-popover"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        p="xs"
      >
        <Stack gap="xs">
          <TextInput
            placeholder="Search nodes..."
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            size="xs"
            data-testid="hover-extend-search"
            autoFocus
          />
          <ScrollArea style={{ maxHeight: 360 }} type="auto">
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
                    <ControlFlowRow
                      key={entry.type}
                      entry={entry}
                      onClick={() => onPickControlFlow(entry.type)}
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
                      <Group
                        key={entry.activityType}
                        gap="xs"
                        wrap="nowrap"
                        data-testid={`hover-extend-activity-${entry.activityType}`}
                        onClick={() => onPickActivity(entry.activityType)}
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
                          aria-hidden
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
      </Popover.Dropdown>
    </Popover>
  );
}

interface ControlFlowRowProps {
  entry: ControlFlowPaletteEntry;
  onClick: () => void;
}

function ControlFlowRow({ entry, onClick }: ControlFlowRowProps) {
  const Icon = CONTROL_FLOW_ICONS[entry.type];
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      data-testid={`hover-extend-control-flow-${entry.type}`}
      onClick={onClick}
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
  );
}
