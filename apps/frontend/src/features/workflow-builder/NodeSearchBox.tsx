/**
 * G-009 — "Find a node" for the current graph.
 *
 * Deliberately NOT a second selection mechanism: the component only reports
 * which node the author picked. The page routes that through
 * `selectNodeSticky` + `revealNodes` — the helpers batch 8 added precisely so
 * a programmatic selection holds and the viewport moves to it.
 *
 * The palette's "Search activities…" one panel over searches the CATALOG.
 * This searches `config.nodes`. They are different questions and the editor
 * previously only answered the first.
 */

import {
  Box,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { searchNodes } from "./node-search";

/** Cap on rendered rows — a query matching half the graph is not a result. */
const MAX_RESULTS = 12;

interface NodeSearchBoxProps {
  config: GraphWorkflowConfig;
  /** Called with the picked node id. The page selects + reveals it. */
  onSelectNode: (nodeId: string) => void;
}

export function NodeSearchBox({ config, onSelectNode }: NodeSearchBoxProps) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchNodes(config, query), [config, query]);
  const hasQuery = query.trim() !== "";
  const shown = results.slice(0, MAX_RESULTS);

  const pick = (nodeId: string) => {
    setQuery("");
    onSelectNode(nodeId);
  };

  return (
    <Popover
      opened={hasQuery}
      position="bottom-start"
      shadow="md"
      width={320}
      withinPortal
      // The input owns focus; the dropdown is a passive result list.
      trapFocus={false}
      closeOnClickOutside={false}
      // Same reason as ConnectSummaryPopover: skip the mount transition so a
      // jsdom render (and a fast typist) sees the list immediately.
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <TextInput
          size="xs"
          placeholder="Find a node…"
          aria-label="Find a node in this workflow"
          data-testid="node-search-input"
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          style={{ flex: 1, minWidth: 140, maxWidth: 240 }}
        />
      </Popover.Target>
      <Popover.Dropdown p={4}>
        {shown.length === 0 ? (
          <Text size="xs" c="dimmed" p={6} data-testid="node-search-empty">
            No node matches “{query.trim()}” in this workflow.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={260} type="auto">
            <Stack gap={2}>
              {shown.map((hit) => (
                <UnstyledButton
                  key={hit.nodeId}
                  data-testid={`node-search-result-${hit.nodeId}`}
                  onClick={() => pick(hit.nodeId)}
                  px={8}
                  py={4}
                  style={{ borderRadius: 4 }}
                >
                  <Text size="xs" fw={600} lineClamp={1}>
                    {hit.label || hit.nodeId}
                  </Text>
                  <Text size="10px" c="dimmed" lineClamp={1}>
                    {hit.typeLabel} · {hit.nodeId}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
        {results.length > shown.length && (
          <Box px={8} py={4}>
            <Text size="10px" c="dimmed">
              +{results.length - shown.length} more — refine the search.
            </Text>
          </Box>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
