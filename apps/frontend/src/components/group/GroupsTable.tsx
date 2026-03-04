import { Button, Table } from "@mantine/core";
import type { JSX } from "react";

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

/**
 * Reusable table component that displays a list of groups with Join or Leave action buttons.
 * Rows are optionally clickable when `onRowClick` is provided.
 *
 * @param groups - The groups to render.
 * @param memberGroupIds - Set of group IDs the current user belongs to.
 * @param pendingRequestGroupIds - Set of group IDs with pending membership requests.
 * @param onJoin - Optional handler called when the user requests to join a group.
 * @param onLeave - Handler called when the user requests to leave a group.
 * @param joinLoadingGroupId - The group ID whose Join button should show a loading indicator.
 * @param onRowClick - Optional handler called when a table row is clicked.
 * @returns A Mantine Table element.
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
  return (
    <Table highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Description</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {groups.map((group) => (
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
                  Join
                </Button>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
