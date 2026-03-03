import {
  Alert,
  Center,
  Loader,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { type JSX, useState } from "react";
import {
  type GroupRequest,
  useGroupRequests,
} from "../../data/hooks/useGroups";

interface RequestsTabProps {
  groupId: string;
}

const REQUEST_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "DENIED", label: "Denied" },
  { value: "CANCELLED", label: "Cancelled" },
];

/**
 * Tab panel showing all membership requests for the group.
 * Only visible to group admins and system admins.
 * Supports status filtering, defaulting to PENDING.
 * Resolved and cancelled rows are read-only (no action buttons).
 *
 * @param props.groupId - The ID of the group whose requests to display.
 */
export function RequestsTab({ groupId }: RequestsTabProps): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const {
    data: requests,
    isLoading,
    isError,
  } = useGroupRequests(groupId, statusFilter);

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
        onChange={(value) => setStatusFilter(value ?? "PENDING")}
        data-testid="requests-status-filter"
        w={200}
      />

      {!requests || requests.length === 0 ? (
        <Center py="xl" data-testid="requests-empty">
          <Text c="dimmed">No requests found.</Text>
        </Center>
      ) : (
        <Table highlightOnHover data-testid="requests-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Requested</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests.map((request: GroupRequest) => (
              <Table.Tr key={request.id}>
                <Table.Td>{request.email}</Table.Td>
                <Table.Td>
                  {new Date(request.createdAt).toLocaleDateString()}
                </Table.Td>
                <Table.Td>{request.reason ?? "-"}</Table.Td>
                <Table.Td>{request.status}</Table.Td>
                <Table.Td />
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
