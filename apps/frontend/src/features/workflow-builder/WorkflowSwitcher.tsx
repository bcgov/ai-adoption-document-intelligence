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
 *
 * **The trigger is a chevron, not a button** (UX walkthrough 2026-08-06, item
 * 14). It used to be a labelled `Switch` button sitting to the LEFT of the
 * workflow name, which put a verb where the reader expects to be told where
 * they are: *"The title, where I am, probably should be the first thing.
 * Switch probably should be somewhere else. I don't think it should be a
 * button."* The pattern asked for is the Google Sheets / Microsoft 365 one —
 * document name first, click it to rename, and a chevron beside it lists the
 * other documents. The component therefore renders only the chevron and is
 * placed immediately after `WorkflowTitleField`; the testid is unchanged
 * because e2e reaches for it by id and the id is a name, not an address.
 * Retiring the labelled button also returned ~93px to the top bar, which is
 * most of the fix for its sub-1600px overflow.
 */
import {
  ActionIcon,
  Divider,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconSearch,
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
        {/*
         * The chevron replaced a button that said the word "Switch" (item 14),
         * so a sighted mouse user lost the only explanation of what it does —
         * `aria-label` is read by screen readers and by nobody else. That is a
         * discoverability regression against items 15-17, which were entirely
         * about not being able to find the workflow list, so it gets the same
         * remedy item 19's group header got: name the affordance on hover.
         * Suppressed while the list is open, where the dropdown is the answer
         * and a tooltip is just something in the way.
         */}
        <Tooltip label="Switch workflow" withArrow disabled={opened}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => setOpened((o) => !o)}
            aria-label="Switch workflow"
            aria-expanded={opened}
            data-testid="workflow-switcher-button"
            style={{ flexShrink: 0 }}
          >
            <IconChevronDown size={16} />
          </ActionIcon>
        </Tooltip>
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
