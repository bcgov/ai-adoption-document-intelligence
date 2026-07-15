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

import type { KindRef } from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Box,
  Button,
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
import { useEffect, useMemo, useState } from "react";
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
import { entryAcceptsKind, rankActivityTypesForKind } from "./extend-filter";

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
   * §9 — when set, the activity list is filtered to entries that can accept
   * a value of this kind (see `entryAcceptsKind`) and ranked with exact-kind
   * matches first, so extending from a typed output port surfaces "what can
   * I do with a <kind>?". Flow Control always renders regardless. A
   * "Show all" affordance escapes back to the full catalog. When omitted,
   * the popover renders the full, unranked catalog exactly as before.
   */
  filterKind?: KindRef;
  /**
   * §9 — stable identity of the CURRENT extend gesture (the source node +
   * output port it launched from). Used only to reset the "Show all" toggle
   * per gesture: the popover can stay mounted across the 200ms close-grace
   * while the cursor slides between two output ports of the SAME kind, so
   * `filterKind` alone doesn't change and can't drive the reset. Keying the
   * reset on this identity makes each fresh extend start filtered again.
   */
  gestureKey?: string;
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
  filterKind,
  gestureKey,
  onMouseEnter,
  onMouseLeave,
}: HoverExtendPopoverProps) {
  const [query, setQuery] = useState("");
  // §9 — "Show all" escape hatch from the kind-filtered view. Reset per
  // gesture (source node + port), not per kind: two ports of the same kind
  // share a `filterKind`, so keying on the gesture identity is what makes a
  // fresh extend start filtered again after a prior "Show all".
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setShowAll(false);
  }, [gestureKey]);
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

  // §9 — kind-filter + rank pass applied BEFORE the search filter. Only
  // active when a `filterKind` is set and the user hasn't hit "Show all".
  const kindFilteredCategories = useMemo(() => {
    const out: Array<{
      category: string;
      entries: ReturnType<typeof getCatalogByCategory>[string];
    }> = [];
    for (const cat of CATEGORY_ORDER) {
      if (cat === CONTROL_FLOW_SECTION_LABEL) continue;
      const all = grouped[cat] ?? [];
      if (filterKind === undefined) {
        if (all.length > 0) out.push({ category: cat, entries: all });
        continue;
      }
      const accepting = all.filter((e) =>
        entryAcceptsKind(e.activityType, filterKind),
      );
      if (accepting.length === 0) continue;
      // Rank exact-kind matches first, then map the ordered activityTypes
      // back to their catalog entries.
      const rankedTypes = rankActivityTypesForKind(
        accepting.map((e) => e.activityType),
        filterKind,
      );
      const byType = new Map(accepting.map((e) => [e.activityType, e]));
      const entries = rankedTypes
        .map((t) => byType.get(t))
        .filter((e): e is (typeof accepting)[number] => e !== undefined);
      out.push({ category: cat, entries });
    }
    return out;
  }, [grouped, filterKind]);

  // The full, unfiltered catalog (used unfiltered, on "Show all", and as the
  // zero-match fallback). Always computed so the hook order stays stable.
  const fullCategories = useMemo(() => {
    const out: Array<{
      category: string;
      entries: ReturnType<typeof getCatalogByCategory>[string];
    }> = [];
    for (const cat of CATEGORY_ORDER) {
      if (cat === CONTROL_FLOW_SECTION_LABEL) continue;
      const all = grouped[cat] ?? [];
      if (all.length > 0) out.push({ category: cat, entries: all });
    }
    return out;
  }, [grouped]);

  // Zero matches → fall back to the unfiltered list (no dead end). This also
  // means the "Show all" affordance is redundant, so we hide it below.
  const kindFilterActive =
    filterKind !== undefined && !showAll && kindFilteredCategories.length > 0;

  const baseCategories = kindFilterActive
    ? kindFilteredCategories
    : fullCategories;

  const filteredCategories = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return baseCategories;
    const out: Array<{
      category: string;
      entries: ReturnType<typeof getCatalogByCategory>[string];
    }> = [];
    for (const { category, entries } of baseCategories) {
      const matched = entries.filter(
        (e) =>
          e.displayName.toLowerCase().includes(lower) ||
          e.activityType.toLowerCase().includes(lower),
      );
      if (matched.length > 0) out.push({ category, entries: matched });
    }
    return out;
  }, [baseCategories, query]);

  // Offer "Show all" only while the kind filter is genuinely narrowing the
  // list (a real filterKind, not showing-all already, and at least one match
  // to filter against — the zero-match fallback needs no escape hatch).
  const showShowAll =
    filterKind !== undefined && !showAll && kindFilteredCategories.length > 0;

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
        mah="calc(100vh - 120px)"
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
          <ScrollArea h={360} type="auto">
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
          {showShowAll && (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              fullWidth
              data-testid="hover-extend-show-all"
              onClick={() => setShowAll(true)}
            >
              Show all nodes
            </Button>
          )}
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
