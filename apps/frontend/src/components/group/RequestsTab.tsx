import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle } from "@tabler/icons-react";
import { type JSX, useState } from "react";
import {
  type GroupRequest,
  useApproveMembershipRequest,
  useDenyMembershipRequest,
  useGroupRequests,
} from "../../data/hooks/useGroups";

interface RequestsTabProps {
  groupId: string;
  isAdmin: boolean;
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
 * PENDING rows show Approve and Deny buttons (with optional reason) when `isAdmin` is true.
 *
 * @param props.groupId - The ID of the group whose requests to display.
 * @param props.isAdmin - Whether the current user is a group admin or system admin.
 */
export function RequestsTab({
  groupId,
  isAdmin,
}: RequestsTabProps): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<GroupRequest | null>(
    null,
  );
  const [approveReason, setApproveReason] = useState("");
  const [denyReason, setDenyReason] = useState("");

  const {
    data: requests,
    isLoading,
    isError,
  } = useGroupRequests(groupId, statusFilter);

  const approveMutation = useApproveMembershipRequest(groupId);
  const denyMutation = useDenyMembershipRequest(groupId);

  const openApproveModal = (request: GroupRequest) => {
    setSelectedRequest(request);
    setApproveReason("");
    setApproveModalOpen(true);
  };

  const openDenyModal = (request: GroupRequest) => {
    setSelectedRequest(request);
    setDenyReason("");
    setDenyModalOpen(true);
  };

  const handleApproveSubmit = () => {
    if (!selectedRequest) return;
    approveMutation.mutate(
      { requestId: selectedRequest.id, reason: approveReason || undefined },
      {
        onSuccess: () => {
          setApproveModalOpen(false);
          setSelectedRequest(null);
          setApproveReason("");
        },
        onError: () => {
          notifications.show({
            title: "Error",
            message: "Failed to approve membership request. Please try again.",
            color: "red",
          });
        },
      },
    );
  };

  const handleDenySubmit = () => {
    if (!selectedRequest) return;
    denyMutation.mutate(
      { requestId: selectedRequest.id, reason: denyReason || undefined },
      {
        onSuccess: () => {
          setDenyModalOpen(false);
          setSelectedRequest(null);
          setDenyReason("");
        },
        onError: () => {
          notifications.show({
            title: "Error",
            message: "Failed to deny membership request. Please try again.",
            color: "red",
          });
        },
      },
    );
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
                <Table.Td>
                  {isAdmin && request.status === "PENDING" && (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        data-testid={`approve-btn-${request.id}`}
                        onClick={() => openApproveModal(request)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        data-testid={`deny-btn-${request.id}`}
                        onClick={() => openDenyModal(request)}
                      >
                        Deny
                      </Button>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        title="Approve Membership Request"
        data-testid="approve-modal"
      >
        <Stack gap="md">
          <Text size="sm">
            Approving request from <strong>{selectedRequest?.email}</strong>.
            You may optionally provide a reason.
          </Text>
          <Textarea
            label="Reason (optional)"
            placeholder="Enter a reason..."
            value={approveReason}
            onChange={(e) => setApproveReason(e.currentTarget.value)}
            data-testid="approve-reason-input"
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setApproveModalOpen(false)}
              data-testid="approve-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              color="green"
              loading={approveMutation.isPending}
              onClick={handleApproveSubmit}
              data-testid="approve-confirm-btn"
            >
              Approve
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={denyModalOpen}
        onClose={() => setDenyModalOpen(false)}
        title="Deny Membership Request"
        data-testid="deny-modal"
      >
        <Stack gap="md">
          <Text size="sm">
            Denying request from <strong>{selectedRequest?.email}</strong>. You
            may optionally provide a reason.
          </Text>
          <Textarea
            label="Reason (optional)"
            placeholder="Enter a reason..."
            value={denyReason}
            onChange={(e) => setDenyReason(e.currentTarget.value)}
            data-testid="deny-reason-input"
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setDenyModalOpen(false)}
              data-testid="deny-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={denyMutation.isPending}
              onClick={handleDenySubmit}
              data-testid="deny-confirm-btn"
            >
              Deny
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
