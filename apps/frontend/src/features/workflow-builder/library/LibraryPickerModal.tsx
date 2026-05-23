/**
 * LibraryPickerModal — counterpart to TemplatesPickerModal for picking
 * a library workflow (US-062). Fetches via `useWorkflows({ kind:
 * "library" })` (which calls `GET /api/workflows?kind=library`), lists
 * each library workflow with its declared signature, and emits the
 * selected `WorkflowInfo` to the host via `onSelect`.
 *
 * Wired into `ChildWorkflowNodeSettings` (US-063) — replaces the
 * free-text `workflowId` TextInput on the library branch of
 * `workflowRef`.
 */

import {
  Badge,
  Box,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { WorkflowInfo } from "../../../data/hooks/useWorkflows";
import { useWorkflows } from "../../../data/hooks/useWorkflows";
import type {
  GraphMetadata,
  LibraryPortDescriptor,
} from "../../../types/workflow";

export interface LibraryPickerModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (workflow: WorkflowInfo) => void;
}

export function LibraryPickerModal({
  opened,
  onClose,
  onSelect,
}: LibraryPickerModalProps) {
  const { data, isLoading, isError, error, refetch } = useWorkflows({
    kind: "library",
  });
  const [query, setQuery] = useState("");

  const libraries = data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return libraries;
    return libraries.filter((wf) => {
      if (wf.name.toLowerCase().includes(q)) return true;
      if (wf.description?.toLowerCase().includes(q)) return true;
      if (wf.slug.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [libraries, query]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Pick library workflow"
      size="lg"
      centered
      data-testid="library-picker-modal"
    >
      <Stack gap="sm">
        <TextInput
          placeholder="Search libraries..."
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          size="sm"
          autoFocus
        />
        <ScrollArea style={{ maxHeight: 480 }} type="auto">
          {isLoading && (
            <Group justify="center" py="md">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Loading libraries…
              </Text>
            </Group>
          )}
          {isError && (
            <Stack align="center" py="md" gap="xs">
              <Text size="sm" c="red">
                Failed to load libraries:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
              </Text>
              <UnstyledButton
                onClick={() => refetch()}
                style={{
                  padding: "4px 8px",
                  border:
                    "1px solid var(--mantine-color-default-border, #2c2e33)",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                Retry
              </UnstyledButton>
            </Stack>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              {libraries.length === 0
                ? "No libraries yet — use “Save as library” from a workflow editor to create one."
                : `No libraries match "${query}".`}
            </Text>
          )}
          {!isLoading && !isError && filtered.length > 0 && (
            <Stack gap="xs">
              {filtered.map((wf) => (
                <LibraryCard
                  key={wf.id}
                  workflow={wf}
                  onSelect={() => onSelect(wf)}
                />
              ))}
            </Stack>
          )}
        </ScrollArea>
      </Stack>
    </Modal>
  );
}

interface LibraryCardProps {
  workflow: WorkflowInfo;
  onSelect: () => void;
}

function LibraryCard({ workflow, onSelect }: LibraryCardProps) {
  const metadata = workflow.config.metadata as GraphMetadata | undefined;
  const inputs: LibraryPortDescriptor[] = metadata?.inputs ?? [];
  const outputs: LibraryPortDescriptor[] = metadata?.outputs ?? [];

  return (
    <UnstyledButton
      onClick={onSelect}
      data-testid={`library-picker-card-${workflow.id}`}
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
            {workflow.name}
          </Text>
          <Group gap={6} wrap="nowrap">
            <Badge size="xs" variant="light" color="blue">
              {inputs.length} input{inputs.length === 1 ? "" : "s"}
            </Badge>
            <Badge size="xs" variant="light" color="grape">
              {outputs.length} output{outputs.length === 1 ? "" : "s"}
            </Badge>
          </Group>
        </Group>
        {workflow.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {workflow.description}
          </Text>
        )}
        {(inputs.length > 0 || outputs.length > 0) && (
          <Stack gap={2} mt={4}>
            {inputs.length > 0 && (
              <Text size="10px" c="dimmed">
                <strong>Inputs:</strong>{" "}
                {inputs.map((i) => `${i.label} (${i.type})`).join(", ")}
              </Text>
            )}
            {outputs.length > 0 && (
              <Text size="10px" c="dimmed">
                <strong>Outputs:</strong>{" "}
                {outputs.map((o) => `${o.label} (${o.type})`).join(", ")}
              </Text>
            )}
          </Stack>
        )}
        <Box>
          <Text size="10px" c="dimmed" ff="monospace">
            {workflow.slug} · {workflow.id}
          </Text>
        </Box>
      </Stack>
    </UnstyledButton>
  );
}
