/**
 * Inderdeep walkthrough 2026-07-29 — from inside the editor there was no way
 * to reach another workflow: no in-app back, no switcher, so every hop meant
 * browser-back to the list ("back and forth, back and forth"). A plain
 * dropdown was floated but doesn't scale past a few dozen workflows, so this
 * is a searchable switcher: type to filter by name or slug, pick to open.
 *
 * Navigation goes through `navigate()`, so the G-027 unsaved-changes guard
 * still intercepts it when the current graph is dirty. The "All workflows"
 * row doubles as the in-app back affordance the top bar never had.
 */
import {
  Box,
  Button,
  Divider,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconSearch,
  IconSwitchHorizontal,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflows } from "../../data/hooks/useWorkflows";

/** Cap on rendered rows — same reasoning as NodeSearchBox's cap. */
const MAX_RESULTS = 12;

interface WorkflowSwitcherProps {
  /** Lineage id of the workflow open in the editor; null in create mode. */
  currentWorkflowId: string | null;
}

export function WorkflowSwitcher({ currentWorkflowId }: WorkflowSwitcherProps) {
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const { data: workflows } = useWorkflows();

  const results = useMemo(() => {
    const all = workflows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (w) =>
        w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q),
    );
  }, [workflows, query]);
  const shown = results.slice(0, MAX_RESULTS);

  const close = () => {
    setOpened(false);
    setQuery("");
  };

  const openWorkflow = (id: string) => {
    close();
    if (id !== currentWorkflowId) navigate(`/workflows/${id}/edit`);
  };

  return (
    <Popover
      opened={opened}
      onChange={(o) => {
        setOpened(o);
        if (!o) setQuery("");
      }}
      position="bottom-start"
      shadow="md"
      width={320}
      withinPortal
      transitionProps={{ duration: 0 }}
    >
      <Popover.Target>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconSwitchHorizontal size={14} />}
          onClick={() => setOpened((o) => !o)}
          aria-label="Switch workflow"
          data-testid="workflow-switcher-button"
        >
          Switch
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={4}>
        <Stack gap={4}>
          <UnstyledButton
            onClick={() => {
              close();
              navigate("/workflows");
            }}
            px={8}
            py={4}
            style={{ borderRadius: 4 }}
            data-testid="workflow-switcher-all"
          >
            <Text size="xs" fw={600}>
              <IconArrowLeft
                size={12}
                style={{ verticalAlign: "middle", marginRight: 4 }}
              />
              All workflows
            </Text>
          </UnstyledButton>
          <Divider />
          <TextInput
            size="xs"
            placeholder="Search workflows…"
            aria-label="Search workflows"
            data-testid="workflow-switcher-search"
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            data-autofocus
          />
          {shown.length === 0 ? (
            <Text
              size="xs"
              c="dimmed"
              p={6}
              data-testid="workflow-switcher-empty"
            >
              {query.trim() === ""
                ? "No workflows yet."
                : `No workflow matches “${query.trim()}”.`}
            </Text>
          ) : (
            <ScrollArea.Autosize mah={260} type="auto">
              <Stack gap={2}>
                {shown.map((w) => {
                  const isCurrent = w.id === currentWorkflowId;
                  return (
                    <UnstyledButton
                      key={w.id}
                      data-testid={`workflow-switcher-result-${w.id}`}
                      onClick={() => openWorkflow(w.id)}
                      disabled={isCurrent}
                      px={8}
                      py={4}
                      style={{ borderRadius: 4, opacity: isCurrent ? 0.6 : 1 }}
                    >
                      <Text size="xs" fw={600} lineClamp={1}>
                        {w.name}
                        {isCurrent ? " (current)" : ""}
                      </Text>
                      <Text size="10px" c="dimmed" lineClamp={1}>
                        {w.slug} · v{w.version}
                      </Text>
                    </UnstyledButton>
                  );
                })}
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
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
