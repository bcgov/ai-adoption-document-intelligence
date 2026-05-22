/**
 * Left-rail palette for the visual editor.
 *
 * Categories are sourced from the shared catalog (see catalog-utils.ts).
 * Click an entry to add the activity to the canvas — drag-to-canvas is
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
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import {
  CATEGORY_ORDER,
  getActivityVisualHints,
  getCatalogByCategory,
} from "../catalog-utils";

interface ActivityPaletteProps {
  onAddActivity: (activityType: string) => void;
}

export function ActivityPalette({ onAddActivity }: ActivityPaletteProps) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => getCatalogByCategory(), []);

  const filteredCategories = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const out: Array<{
      category: string;
      entries: ReturnType<typeof getCatalogByCategory>[string];
    }> = [];
    for (const cat of CATEGORY_ORDER) {
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
          {filteredCategories.length === 0 && (
            <Text size="xs" c="dimmed" ta="center">
              No activities match "{query}".
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
