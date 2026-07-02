import {
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "../../../ui";
import { LOOKUP_TEMPLATES } from "../lookup-templates";
import type { ColumnDef, LookupDef } from "../types";
import { LookupForm } from "./LookupForm";

interface Props {
  groupId: string;
  tableId: string;
  columns: ColumnDef[];
  lookups: LookupDef[];
  onShowSnippet: (lookup: LookupDef) => void;
  isAdmin: boolean;
}

export function LookupsTab({
  groupId,
  tableId,
  columns,
  lookups,
  onShowSnippet,
  isAdmin,
}: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LookupDef | "new" | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(
    null,
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tables", groupId, tableId] });
  };

  const save = async (lookup: LookupDef, originalName?: string) => {
    if (originalName) {
      const response = await apiService.patch(
        `/tables/${tableId}/lookups/${originalName}?group_id=${groupId}`,
        lookup,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to update lookup");
    } else {
      const response = await apiService.post(
        `/tables/${tableId}/lookups?group_id=${groupId}`,
        lookup,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to add lookup");
    }
    invalidate();
  };

  const remove = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiService.delete(
        `/tables/${tableId}/lookups/${name}?group_id=${groupId}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to delete lookup");
    },
    onSuccess: () => {
      invalidate();
      setConfirmDeleteName(null);
    },
  });

  return (
    <Stack>
      <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
        A lookup is a saved search you define once and reuse from any workflow.
        When a workflow runs, it calls the lookup by name and passes values for
        its inputs — the lookup scans the table, applies its filter, and returns
        the matching row(s). <br />
        <strong>
          Example: a <code>findRate</code> lookup on a rates table accepts an{" "}
          <code>as_of_date</code> input and returns the rate row in effect on
          that date.
        </strong>{" "}
        <br />
        Use the <strong>Use in workflow</strong> button on any lookup to copy a
        ready-made workflow node snippet.
      </Alert>
      {isAdmin && (
        <Group justify="flex-end">
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setEditing("new")}
            disabled={columns.length === 0}
          >
            Add lookup
          </Button>
        </Group>
      )}
      {columns.length === 0 ? (
        <Text c="dimmed" fs="italic">
          Define columns first (use the Columns tab) — lookups reference column
          values.
        </Text>
      ) : lookups.length === 0 ? (
        <Text c="dimmed" fs="italic">
          No lookups defined yet. click add lookup to create one.
        </Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Match type</Table.Th>
              <Table.Th>Returns</Table.Th>
              <Table.Th>Inputs</Table.Th>
              <Table.Th ta="right" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lookups.map((l) => (
              <Table.Tr key={l.name}>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {l.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {LOOKUP_TEMPLATES.find(
                    (t) => t.id === (l.templateId ?? "custom-json"),
                  )?.label ?? "Custom (advanced)"}
                </Table.Td>
                <Table.Td>
                  {l.pick === "one"
                    ? "Exactly one"
                    : l.pick === "first"
                      ? "First match"
                      : l.pick === "last"
                        ? "Last match"
                        : "All matches"}
                </Table.Td>
                <Table.Td>
                  {l.params.map((p) => p.name).join(", ") || "—"}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => onShowSnippet(l)}
                    >
                      Use in workflow
                    </Button>
                    {isAdmin && (
                      <>
                        <Tooltip label="Edit" withArrow>
                          <ActionIcon
                            variant="subtle"
                            onClick={() => setEditing(l)}
                            aria-label={`Edit lookup ${l.name}`}
                          >
                            <IconPencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => setConfirmDeleteName(l.name)}
                            aria-label={`Delete lookup ${l.name}`}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {isAdmin && editing && (
        <LookupForm
          opened={!!editing}
          onClose={() => setEditing(null)}
          columns={columns}
          initial={editing === "new" ? undefined : editing}
          onSubmit={(l) =>
            save(l, editing === "new" ? undefined : (editing as LookupDef).name)
          }
        />
      )}
      <Modal
        opened={!!confirmDeleteName}
        onClose={() => setConfirmDeleteName(null)}
        title="Delete lookup?"
      >
        <Stack>
          <Text>
            Delete lookup{" "}
            <Text span ff="monospace">
              {confirmDeleteName}
            </Text>
            ? This cannot be undone.
          </Text>
          {remove.isError && (
            <Text c="red" size="sm">
              {(remove.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setConfirmDeleteName(null)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={16} />}
              loading={remove.isPending}
              onClick={() => {
                if (confirmDeleteName) remove.mutate(confirmDeleteName);
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
