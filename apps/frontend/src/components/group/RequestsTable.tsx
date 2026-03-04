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
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconChevronDown,
  IconChevronUp,
  IconSelector,
} from "@tabler/icons-react";
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
  /**
   * Optional extractor returning a primitive value used for sorting and search filtering.
   * Columns without this function are treated as non-sortable and excluded from search.
   *
   * @param row - The request row data.
   * @returns A sortable/searchable primitive, or null/undefined when not applicable.
   */
  sortValue?: (row: T) => string | number | null | undefined;
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
    {
      key: "email",
      header: "Email",
      render: (r) => r.email,
      sortValue: (r) => r.email,
    },
    {
      key: "requested",
      header: "Requested",
      render: (r) => new Date(r.createdAt).toLocaleDateString(),
      sortValue: (r) => r.createdAt,
    },
    {
      key: "resolved",
      header: "Resolved",
      render: (r) =>
        r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : "-",
      sortValue: (r) => r.resolvedAt ?? "",
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) => r.reason ?? "-",
      sortValue: (r) => r.reason ?? "",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => r.status,
      sortValue: (r) => r.status,
    },
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
    {
      key: "group",
      header: "Group",
      render: (r) => r.groupName,
      sortValue: (r) => r.groupName,
    },
    {
      key: "submitted",
      header: "Submitted",
      render: (r) => new Date(r.createdAt).toLocaleDateString(),
      sortValue: (r) => r.createdAt,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge>,
      sortValue: (r) => r.status,
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) => r.reason ?? "\u2014",
      sortValue: (r) => r.reason ?? "",
    },
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
 * Returns the appropriate sort direction icon for a column.
 *
 * @param col - The column definition to render the icon for.
 * @param sortKey - The currently active sort column key.
 * @param sortDir - The current sort direction.
 * @returns A sort icon element.
 */
function SortIcon({
  colKey,
  sortKey,
  sortDir,
}: {
  colKey: string;
  sortKey: string | null;
  sortDir: "asc" | "desc";
}): JSX.Element {
  if (sortKey !== colKey) return <IconSelector size={14} />;
  return sortDir === "asc" ? (
    <IconChevronUp size={14} />
  ) : (
    <IconChevronDown size={14} />
  );
}

/**
 * Generic component for displaying a filterable, searchable, sortable table of membership requests.
 * Manages its own status filter, search, and sort state. Handles loading, error and empty states.
 * Column headers and cell content are fully configurable via the `columns` prop.
 * Columns that provide a `sortValue` function are sortable and included in text search.
 *
 * @param props.fetchData - Callback invoked with the current status filter to retrieve rows.
 * @param props.columns - Column definitions (key, header, render, optional sortValue).
 * @param props.emptyMessage - Text shown when there are no requests to display.
 */
export function RequestsTable<T extends { id: string }>({
  fetchData,
  columns,
  emptyMessage = "No requests found.",
}: RequestsTableProps<T>): JSX.Element {
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: requests, isLoading, isError } = fetchData(statusFilter);

  /**
   * Toggles sort direction for the same column, or activates a new sort column.
   *
   * @param key - The column key to sort by.
   */
  const toggleSort = (key: string): void => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

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

  const sortableColumns = columns.filter((c) => c.sortValue !== undefined);

  const filtered = (requests ?? []).filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return sortableColumns.some((col) => {
      const val = col.sortValue?.(row);
      return val != null && String(val).toLowerCase().includes(q);
    });
  });

  const activeCol = sortKey ? columns.find((c) => c.key === sortKey) : null;
  const sorted = activeCol?.sortValue
    ? [...filtered].sort((a, b) => {
        const av = activeCol.sortValue!(a) ?? "";
        const bv = activeCol.sortValue!(b) ?? "";
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  return (
    <Stack gap="md">
      <Group align="flex-end">
        <Select
          label="Filter by status"
          data={REQUEST_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value ?? statusFilter)}
          data-testid="requests-status-filter"
          w={200}
        />
        <TextInput
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          data-testid="requests-search"
          style={{ flex: 1 }}
        />
      </Group>

      {sorted.length === 0 ? (
        <Center py="xl" data-testid="requests-empty">
          <Text c="dimmed">{emptyMessage}</Text>
        </Center>
      ) : (
        <Table highlightOnHover data-testid="requests-table">
          <Table.Thead>
            <Table.Tr>
              {columns.map((col) => (
                <Table.Th key={col.key}>
                  {col.sortValue !== undefined ? (
                    <UnstyledButton
                      onClick={() => toggleSort(col.key)}
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                      data-testid={`sort-${col.key}`}
                    >
                      {col.header}
                      <SortIcon
                        colKey={col.key}
                        sortKey={sortKey}
                        sortDir={sortDir}
                      />
                    </UnstyledButton>
                  ) : (
                    col.header
                  )}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((row) => (
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
