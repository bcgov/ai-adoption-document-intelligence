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
} from "@mantine/core";
import { IconInfoCircle, IconPencil, IconTrash } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
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
        Lookups are named queries that workflow activity nodes run against this
        table at runtime. Each lookup defines filter conditions, parameters
        accepted from the workflow context, and a pick strategy (first, last,
        one, or all matching rows). Use the <strong>Use in workflow</strong>{" "}
        button to copy a ready-made node snippet.
      </Alert>
      {isAdmin && (
        <Group justify="flex-end">
          <Button
            onClick={() => setEditing("new")}
            disabled={columns.length === 0}
          >
            Add Lookup
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
          No lookups defined yet. Click Add Lookup to create one.
        </Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Template</Table.Th>
              <Table.Th>Pick</Table.Th>
              <Table.Th>Params</Table.Th>
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
                <Table.Td>{l.templateId ?? "custom-json"}</Table.Td>
                <Table.Td>{l.pick}</Table.Td>
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
