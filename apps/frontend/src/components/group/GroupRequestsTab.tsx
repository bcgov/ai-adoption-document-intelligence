import { Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type JSX, useState } from "react";
import {
  type GroupRequest,
  useApproveMembershipRequest,
  useDenyMembershipRequest,
  useGroupRequests,
} from "../../data/hooks/useGroups";
import { makeGroupRequestColumns, RequestsTable } from "./RequestsTable";

interface RequestsTabProps {
  groupId: string;
  isAdmin: boolean;
}

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
export function GroupRequestsTab({
  groupId,
  isAdmin,
}: RequestsTabProps): JSX.Element {
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<GroupRequest | null>(
    null,
  );
  const [approveReason, setApproveReason] = useState("");
  const [denyReason, setDenyReason] = useState("");

  const approveMutation = useApproveMembershipRequest(groupId);
  const denyMutation = useDenyMembershipRequest(groupId);

  /**
   * Opens the approve modal for the given request.
   *
   * @param request - The request to approve.
   */
  const openApproveModal = (request: GroupRequest) => {
    setSelectedRequest(request);
    setApproveReason("");
    setApproveModalOpen(true);
  };

  /**
   * Opens the deny modal for the given request.
   *
   * @param request - The request to deny.
   */
  const openDenyModal = (request: GroupRequest) => {
    setSelectedRequest(request);
    setDenyReason("");
    setDenyModalOpen(true);
  };

  /**
   * Submits the approve mutation after the user confirms the action in the modal.
   */
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

  /**
   * Submits the deny mutation after the user confirms the action in the modal.
   */
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

  const columns = makeGroupRequestColumns(
    isAdmin,
    openApproveModal,
    openDenyModal,
  );

  return (
    <>
      <RequestsTable
        fetchData={(status) => useGroupRequests(groupId, status)}
        columns={columns}
      />

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
    </>
  );
}
