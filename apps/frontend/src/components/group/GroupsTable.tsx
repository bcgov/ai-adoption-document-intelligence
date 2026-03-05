import { Button, Group, Table, TextInput, UnstyledButton } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconSelector,
} from "@tabler/icons-react";
import { type JSX, useState } from "react";

/** Minimal group shape required by the GroupsTable component. */
export interface GroupTableEntry {
  id: string;
  name: string;
  description?: string;
}

interface GroupsTableProps {
  /** The groups to display in the table. */
  groups: GroupTableEntry[];
  /** IDs of groups the current user is a member of. */
  memberGroupIds: Set<string>;
  /** IDs of groups for which the user has a pending membership request. */
  pendingRequestGroupIds: Set<string>;
  /** Called when the user clicks Join on a group. Optional – omit when Join is never reachable. */
  onJoin?: (groupId: string) => void;
  /** Called when the user clicks Leave on a group. */
  onLeave: (groupId: string) => void;
  /** The group ID currently being joined, used to show a loading state on the Join button. */
  joinLoadingGroupId?: string | null;
  /** Optional click handler for an entire row (e.g., navigate to group detail). */
  onRowClick?: (groupId: string) => void;
}

/** Columns available for sorting. */
type SortField = "name" | "description";

/**
 * Returns the appropriate sort direction icon for a column header.
 *
 * @param field - The column field this icon represents.
 * @param sortField - The currently active sort field.
 * @param sortDir - The current sort direction.
 * @returns A sort icon component.
 */
function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField | null;
  sortDir: "asc" | "desc";
}): JSX.Element {
  if (sortField !== field) return <IconSelector size={14} />;
  return sortDir === "asc" ? (
    <IconChevronUp size={14} />
  ) : (
    <IconChevronDown size={14} />
  );
}

/**
 * Reusable table component that displays a list of groups with Join or Leave action buttons.
 * Includes a search bar and sortable column headers for Name and Description.
 * Rows are optionally clickable when `onRowClick` is provided.
 *
 * @param groups - The groups to render.
 * @param memberGroupIds - Set of group IDs the current user belongs to.
 * @param pendingRequestGroupIds - Set of group IDs with pending membership requests.
 * @param onJoin - Optional handler called when the user requests to join a group.
 * @param onLeave - Handler called when the user requests to leave a group.
 * @param joinLoadingGroupId - The group ID whose Join button should show a loading indicator.
 * @param onRowClick - Optional handler called when a table row is clicked.
 * @returns A Mantine Table element with search and sort controls.
 */
export function GroupsTable({
  groups,
  memberGroupIds,
  pendingRequestGroupIds,
  onJoin,
  onLeave,
  joinLoadingGroupId,
  onRowClick,
}: GroupsTableProps): JSX.Element {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  /**
   * Toggles sort direction when the same column is clicked, or sets a new sort column.
   *
   * @param field - The column field to sort by.
   */
  const toggleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filtered = groups.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        const av = (a[sortField] ?? "").toLowerCase();
        const bv = (b[sortField] ?? "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : filtered;

  return (
    <Group gap="md" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <TextInput
        placeholder="Search by name or description…"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        data-testid="groups-search"
      />
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              <UnstyledButton
                onClick={() => toggleSort("name")}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
                data-testid="sort-name"
              >
                Name
                <SortIcon
                  field="name"
                  sortField={sortField}
                  sortDir={sortDir}
                />
              </UnstyledButton>
            </Table.Th>
            <Table.Th>
              <UnstyledButton
                onClick={() => toggleSort("description")}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
                data-testid="sort-description"
              >
                Description
                <SortIcon
                  field="description"
                  sortField={sortField}
                  sortDir={sortDir}
                />
              </UnstyledButton>
            </Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((group) => (
            <Table.Tr
              key={group.id}
              style={onRowClick ? { cursor: "pointer" } : undefined}
              onClick={onRowClick ? () => onRowClick(group.id) : undefined}
            >
              <Table.Td>{group.name}</Table.Td>
              <Table.Td>{group.description ?? ""}</Table.Td>
              <Table.Td>
                {memberGroupIds.has(group.id) ? (
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLeave(group.id);
                    }}
                    data-testid={`leave-btn-${group.id}`}
                  >
                    Leave
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="light"
                    disabled={pendingRequestGroupIds.has(group.id)}
                    loading={joinLoadingGroupId === group.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoin?.(group.id);
                    }}
                    data-testid={`join-btn-${group.id}`}
                  >
                    {pendingRequestGroupIds.has(group.id)
                      ? "Request Pending"
                      : "Join"}
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Group>
  );
}
