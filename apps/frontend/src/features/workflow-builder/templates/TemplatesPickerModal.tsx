/**
 * Templates picker modal — "New from template" entry point.
 *
 * Lists every entry in WORKFLOW_TEMPLATES. Clicking a card calls
 * `onSelect(template)`; the host page is responsible for navigating to
 * the editor with the template payload (so the same modal can serve
 * either the list page or other entry points later).
 */

import {
  Badge,
  Box,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./index";

interface TemplatesPickerModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (template: WorkflowTemplate) => void;
}

export function TemplatesPickerModal({
  opened,
  onClose,
  onSelect,
}: TemplatesPickerModalProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WORKFLOW_TEMPLATES;
    return WORKFLOW_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        t.id.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New workflow from template"
      size="lg"
      centered
    >
      <Stack gap="sm">
        <TextInput
          placeholder="Search templates..."
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          size="sm"
          autoFocus
        />
        <ScrollArea style={{ maxHeight: 480 }} type="auto">
          <Stack gap="xs">
            {filtered.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No templates match "{query}".
              </Text>
            )}
            {filtered.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onSelect={() => onSelect(tpl)}
              />
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    </Modal>
  );
}

interface TemplateCardProps {
  template: WorkflowTemplate;
  onSelect: () => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  return (
    <UnstyledButton
      onClick={onSelect}
      style={{
        borderRadius: 8,
        padding: "10px 12px",
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        background: "var(--mantine-color-default, #1a1b1e)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "var(--mantine-color-default-hover, #25262b)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "var(--mantine-color-default, #1a1b1e)";
      }}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text fw={600} size="sm" truncate>
            {template.name}
          </Text>
          <Badge size="xs" variant="light" color="gray">
            {template.nodeCount} node{template.nodeCount === 1 ? "" : "s"}
          </Badge>
        </Group>
        {template.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {template.description}
          </Text>
        )}
        {template.tags.length > 0 && (
          <Group gap={4} mt={2}>
            {template.tags.map((tag) => (
              <Badge key={tag} size="xs" variant="dot" color="blue">
                {tag}
              </Badge>
            ))}
          </Group>
        )}
        <Box>
          <Text size="10px" c="dimmed" ff="monospace">
            {template.id}
          </Text>
        </Box>
      </Stack>
    </UnstyledButton>
  );
}
