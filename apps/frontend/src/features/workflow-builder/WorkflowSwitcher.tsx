/**
 * UX walkthrough 2026-07-29 — from inside the editor there was no way
 * to reach another workflow: no in-app back, no switcher, so every hop meant
 * browser-back to the list ("back and forth, back and forth"). This is a
 * searchable switcher: type to filter by name or slug, pick to open. Every
 * match is listed; the search narrows a long list rather than gating it.
 *
 * Navigation goes through `navigate()`, so the G-027 unsaved-changes guard
 * still intercepts it when the current graph is dirty. The "All workflows"
 * row doubles as the in-app back affordance the top bar never had.
 */
import {
  Button,
  Divider,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCheck,
  IconSearch,
  IconSwitchHorizontal,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkflows } from "../../data/hooks/useWorkflows";

/**
 * UX walkthrough 2026-08-06 — the list is uncapped: every match renders and
 * the scroll area carries the overflow. A cap plus a "+N more" line hid the
 * workflow the reviewer had just been editing, with nothing to refine.
 */
const RESULTS_MAX_HEIGHT = 320;

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
      /**
       * UX walkthrough 2026-08-06 — the dropdown would not dismiss on an
       * outside click. `mousedown` alone never reaches the document from the
       * React Flow pane — d3-zoom's `mousedowned` calls
       * `stopImmediatePropagation` — so `click` is added (d3 only suppresses
       * the click when the pointer actually moved),
       * and `trapFocus` puts focus in the dropdown so Escape is caught there.
       */
      closeOnClickOutside
      clickOutsideEvents={["mousedown", "touchstart", "click"]}
      closeOnEscape
      trapFocus
      returnFocus
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
            data-autofocus
          />
          {results.length === 0 ? (
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
            <ScrollArea.Autosize mah={RESULTS_MAX_HEIGHT} type="auto">
              <Stack gap={2}>
                {results.map((w) => {
                  const isCurrent = w.id === currentWorkflowId;
                  return (
                    <UnstyledButton
                      key={w.id}
                      data-testid={`workflow-switcher-result-${w.id}`}
                      data-current={isCurrent ? "true" : undefined}
                      aria-current={isCurrent ? "true" : undefined}
                      onClick={() => openWorkflow(w.id)}
                      px={8}
                      py={4}
                      style={{
                        borderRadius: 4,
                        backgroundColor: isCurrent
                          ? "var(--mantine-color-blue-light, #1c7ed633)"
                          : undefined,
                      }}
                    >
                      <Group gap={6} wrap="nowrap" justify="space-between">
                        <Text
                          size="xs"
                          fw={isCurrent ? 600 : 400}
                          c={
                            isCurrent
                              ? "var(--mantine-color-blue-light-color)"
                              : undefined
                          }
                          lineClamp={1}
                        >
                          {w.name}
                        </Text>
                        {isCurrent && (
                          <IconCheck
                            size={14}
                            aria-hidden
                            data-testid="workflow-switcher-current-check"
                            style={{
                              flexShrink: 0,
                              color: "var(--mantine-color-blue-light-color)",
                            }}
                          />
                        )}
                      </Group>
                    </UnstyledButton>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
