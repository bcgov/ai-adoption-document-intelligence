import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { type JSX, type ReactNode, useState } from "react";
import type {
  GroupRequest,
  MyMembershipRequest,
} from "../../data/hooks/useGroups";

/** Maps a request status string to a Mantine badge colour. */
function statusColor(status: string): string {
  switch (status) {
    case "PENDING":
      return "yellow";
    case "APPROVED":
      return "green";
    case "DENIED":
      return "red";
    case "CANCELLED":
      return "gray";
    default:
      return "gray";
  }
}

const REQUEST_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "DENIED", label: "Denied" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
];

export interface RequestsTableColumn<T> {
  /** Unique key for the column. */
  key: string;
  /** Column header label. */
  header: string;
  /**
   * Renders the cell content for a given row.
   *
   * @param row - The request row data.
   * @returns The rendered cell content.
   */
  render: (row: T) => ReactNode;
}

interface RequestsTableProps<T extends { id: string }> {
  /**
   * Fetches request data for a given status filter.
   *
   * @param status - The current status filter value.
   * @returns An object containing the request data, loading state, and error state.
   */
  fetchData: (status: string) => {
    data: T[] | undefined;
    isLoading: boolean;
    isError: boolean;
  };
  /** Column definitions controlling headers and cell rendering. */
  columns: RequestsTableColumn<T>[];
  /** Message shown when the requests list is empty. Defaults to "No requests found." */
  emptyMessage?: string;
}

/**
 * Returns the column definitions for the group admin requests table.
 * Includes email, requested/resolved dates, reason, status, and approve/deny action buttons.
 *
 * @param isAdmin - Whether the current user is a group or system admin.
 * @param onApprove - Called when the user clicks Approve on a request.
 * @param onDeny - Called when the user clicks Deny on a request.
 * @returns An array of column definitions for use with {@link RequestsTable}.
 */
export function makeGroupRequestColumns(
  isAdmin: boolean,
  onApprove: (request: GroupRequest) => void,
  onDeny: (request: GroupRequest) => void,
): RequestsTableColumn<GroupRequest>[] {
  return [
    { key: "email", header: "Email", render: (r) => r.email },
    {
      key: "requested",
      header: "Requested",
      render: (r) => new Date(r.createdAt).toLocaleDateString(),
    },
    {
      key: "resolved",
      header: "Resolved",
      render: (r) =>
        r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : "-",
    },
    { key: "reason", header: "Reason", render: (r) => r.reason ?? "-" },
    { key: "status", header: "Status", render: (r) => r.status },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        isAdmin && r.status === "PENDING" ? (
          <Group gap="xs">
            <Button
              size="xs"
              color="green"
              variant="light"
              data-testid={`approve-btn-${r.id}`}
              onClick={() => onApprove(r)}
            >
              Approve
            </Button>
            <Button
              size="xs"
              color="red"
              variant="light"
              data-testid={`deny-btn-${r.id}`}
              onClick={() => onDeny(r)}
            >
              Deny
            </Button>
          </Group>
        ) : null,
    },
  ];
}

/**
 * Returns the column definitions for the user's own membership requests table.
 * Includes group name, submitted date, status badge, reason, and a cancel action button.
 *
 * @param onCancel - Called when the user clicks Cancel on a pending request.
 * @returns An array of column definitions for use with {@link RequestsTable}.
 */
export function makeMyRequestColumns(
  onCancel: (requestId: string) => void,
): RequestsTableColumn<MyMembershipRequest>[] {
  return [
    { key: "group", header: "Group", render: (r) => r.groupName },
    {
      key: "submitted",
      header: "Submitted",
      render: (r) => new Date(r.createdAt).toLocaleDateString(),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge>,
    },
    { key: "reason", header: "Reason", render: (r) => r.reason ?? "\u2014" },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.status === "PENDING" ? (
          <Button
            size="xs"
            variant="light"
            color="red"
            onClick={() => onCancel(r.id)}
          >
            Cancel
          </Button>
        ) : null,
    },
  ];
}

/**
 * Generic component for displaying a filterable table of membership requests.
 * Manages its own status filter state. Handles loading, error and empty states.
 * Column headers and cell content are fully configurable via the `columns` prop.
 *
 * @param props.fetchData - Callback invoked with the current status filter to retrieve rows.
 * @param props.columns - Column definitions (key, header, render).
 * @param props.emptyMessage - Text shown when there are no requests to display.
 */
export function RequestsTable<T extends { id: string }>({
  fetchData,
  columns,
  emptyMessage = "No requests found.",
}: RequestsTableProps<T>): JSX.Element {
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const { data: requests, isLoading, isError } = fetchData(statusFilter);
  if (isLoading) {
    return (
      <Center py="xl" data-testid="requests-loading">
        <Loader />
      </Center>
    );
  }

  if (isError) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        color="red"
        data-testid="requests-error"
      >
        Failed to load membership requests. Please try again.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Select
        label="Filter by status"
        data={REQUEST_STATUS_OPTIONS}
        value={statusFilter}
        onChange={(value) => setStatusFilter(value ?? statusFilter)}
        data-testid="requests-status-filter"
        w={200}
      />

      {!requests || requests.length === 0 ? (
        <Center py="xl" data-testid="requests-empty">
          <Text c="dimmed">{emptyMessage}</Text>
        </Center>
      ) : (
        <Table highlightOnHover data-testid="requests-table">
          <Table.Thead>
            <Table.Tr>
              {columns.map((col) => (
                <Table.Th key={col.key}>{col.header}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests.map((row) => (
              <Table.Tr key={row.id}>
                {columns.map((col) => (
                  <Table.Td key={col.key}>{col.render(row)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
