/**
 * Activity-type picker modal for the canvas "Change activity type"
 * context-menu entry (US-047).
 *
 * Reuses the categorised list pattern from `ActivityPalette` so the user
 * sees the same grouping/iconography they'd see in the left rail.
 * Differences from the palette:
 *   - lives in a Mantine `Modal`, not a side rail.
 *   - omits the Flow Control section (only activity ↔ activity swaps are
 *     allowed — see US-047 non-goal).
 *   - the current activity-type row is rendered but is a no-op pick.
 *
 * The host is responsible for closing the modal in response to `onPick`
 * — this component only fires the callback, it does not auto-close.
 */

import {
  Box,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import {
  CATEGORY_ORDER,
  getActivityVisualHints,
  getCatalogByCategory,
} from "../catalog-utils";

interface NodeTypeSwapModalProps {
  opened: boolean;
  /** The activityType the node currently uses — rendered as a non-pickable row. */
  currentActivityType: string;
  onClose: () => void;
  /** Called with the chosen activity type when the user picks a NEW row. */
  onPick: (newActivityType: string) => void;
}

// Flow Control is intentionally excluded from the swap list — activity
// ↔ control-flow swaps aren't supported and the menu entry is disabled
// on control-flow nodes anyway (US-047 Scenario 5, surfaced in US-046).
const FLOW_CONTROL_CATEGORY = "Flow Control";

export function NodeTypeSwapModal({
  opened,
  currentActivityType,
  onClose,
  onPick,
}: NodeTypeSwapModalProps) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => getCatalogByCategory(), []);

  const filteredCategories = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const out: Array<{
      category: string;
      entries: ReturnType<typeof getCatalogByCategory>[string];
    }> = [];
    for (const cat of CATEGORY_ORDER) {
      if (cat === FLOW_CONTROL_CATEGORY) continue;
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

  const nothingMatchesQuery = filteredCategories.length === 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Change activity type"
      size="lg"
      centered
      data-testid="node-type-swap-modal"
    >
      <Stack gap="sm">
        <TextInput
          placeholder="Search activities..."
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          data-testid="node-type-swap-modal-search"
          size="xs"
        />
        <ScrollArea h={420} type="auto">
          <Stack gap="md">
            {filteredCategories.map(({ category, entries }) => (
              <Stack
                key={category}
                gap={4}
                data-testid={`node-type-swap-category-${category}`}
              >
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
                  const isCurrent = entry.activityType === currentActivityType;
                  return (
                    <Group
                      key={entry.activityType}
                      gap="xs"
                      wrap="nowrap"
                      data-testid={`node-type-swap-entry-${entry.activityType}`}
                      data-current={isCurrent ? "true" : "false"}
                      onClick={() => {
                        if (isCurrent) return;
                        onPick(entry.activityType);
                      }}
                      style={{
                        cursor: isCurrent ? "default" : "pointer",
                        padding: "6px 8px",
                        borderRadius: 6,
                        borderLeftWidth: 3,
                        borderLeftStyle: "solid",
                        borderLeftColor: hints.color,
                        background: isCurrent
                          ? "var(--mantine-color-default-hover, #25262b)"
                          : "var(--mantine-color-body, #1a1b1e)",
                        opacity: isCurrent ? 0.7 : 1,
                      }}
                    >
                      <Box style={{ minWidth: 0, flex: 1 }}>
                        <Group gap={6} wrap="nowrap">
                          <span aria-hidden style={{ pointerEvents: "none" }}>
                            {hints.icon}
                          </span>
                          <Text size="xs" fw={500} truncate>
                            {entry.displayName}
                          </Text>
                          {isCurrent && (
                            <Text size="10px" c="dimmed" fs="italic">
                              (current)
                            </Text>
                          )}
                        </Group>
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
              <Text
                size="xs"
                c="dimmed"
                ta="center"
                data-testid="node-type-swap-modal-empty"
              >
                No entries match "{query}".
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Modal>
  );
}
