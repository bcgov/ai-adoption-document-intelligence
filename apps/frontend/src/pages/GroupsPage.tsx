import { IconAlertCircle, IconPlus, IconUsersGroup } from "@tabler/icons-react";
import type { JSX } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { GroupsTable } from "../components/group/GroupsTable";
import {
  makeMyRequestColumns,
  RequestsTable,
} from "../components/group/RequestsTable";
import {
  type MyMembershipRequest,
  useAllGroups,
  useApproveMembershipRequest,
  useCancelMembershipRequest,
  useCreateGroup,
  useLeaveGroup,
  useMyGroups,
  useMyRequests,
  useRequestMembership,
} from "../data/hooks/useGroups";
import {
  Alert,
  Button,
  Center,
  ConfirmActionModal,
  Group,
  Loader,
  Modal,
  notifications,
  PageHeader,
  PanelCard,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  useForm,
} from "../ui";

interface CreateGroupModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * Modal form for creating a new group. Only accessible by system admins.
 *
 * @param opened - Whether the modal is open.
 * @param onClose - Callback to close the modal.
 */
function CreateGroupModal({
  opened,
  onClose,
}: CreateGroupModalProps): JSX.Element {
  const createGroup = useCreateGroup();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      name: "",
      description: "",
    },
    validate: {
      name: (value) => (value.trim().length > 0 ? null : "Name is required"),
    },
  });

  /**
   * Resets form state and closes the modal.
   */
  const handleClose = () => {
    form.reset();
    setServerError(null);
    onClose();
  };

  /**
   * Submits the create group form, handles success and error feedback.
   */
  const handleSubmit = form.onSubmit((values) => {
    setServerError(null);
    createGroup.mutate(
      {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
      },
      {
        onSuccess: () => {
          handleClose();
          notifications.show({
            title: "Group created",
            message: `Group "${values.name.trim()}" was created successfully.`,
            color: "green",
          });
        },
        onError: (error) => {
          setServerError(
            error.message ?? "Failed to create group. Please try again.",
          );
        },
      },
    );
  });

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create group"
      data-testid="create-group-modal"
    >
      <form onSubmit={handleSubmit}>
        <Stack>
          <TextInput
            label="Name"
            placeholder="Group name"
            withAsterisk
            data-testid="create-group-name"
            {...form.getInputProps("name")}
          />
          <Textarea
            label="Description"
            placeholder="Group description (optional)"
            data-testid="create-group-description"
            {...form.getInputProps("description")}
          />
          {serverError && (
            <Alert color="red" data-testid="create-group-server-error">
              {serverError}
            </Alert>
          )}
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={handleClose}
              data-testid="create-group-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createGroup.isPending}
              data-testid="create-group-submit-btn"
            >
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/**
 * Tab panel showing all available groups in the system.
 * Displays each group's name, description, and an action button
 * to join (submit a membership request) or leave the group depending
 * on the authenticated user's current membership.
 */
function AllGroupsTab(): JSX.Element {
  const { user } = useAuth();
  const [pendingLeaveGroupId, setPendingLeaveGroupId] = useState<string | null>(
    null,
  );

  const {
    data: allGroups,
    isLoading: allGroupsLoading,
    isError: allGroupsError,
  } = useAllGroups();

  const { data: myGroups } = useMyGroups(user?.sub ?? "");
  const { data: myPendingRequests } = useMyRequests("PENDING");

  const memberGroupIds = new Set((myGroups ?? []).map((g) => g.id));
  const pendingRequestGroupIds = new Set(
    (myPendingRequests ?? []).map((r) => r.groupId),
  );

  const leaveMutation = useLeaveGroup(pendingLeaveGroupId ?? "");
  const requestMutation = useRequestMembership();

  const navigate = useNavigate();

  /**
   * Submits a membership request for the given group and notifies on success or failure.
   *
   * @param groupId - The ID of the group to request membership for.
   */
  const handleJoin = (groupId: string) => {
    requestMutation.mutate(
      { groupId },
      {
        onSuccess: () => {
          notifications.show({
            title: "Request submitted",
            message: "Your membership request has been submitted.",
            color: "green",
          });
        },
        onError: () => {
          notifications.show({
            title: "Error",
            message: "Failed to submit membership request. Please try again.",
            color: "red",
          });
        },
      },
    );
  };

  /**
   * Confirms and executes the leave action for the pending group.
   */
  const handleConfirmLeave = () => {
    leaveMutation.mutate(undefined, {
      onSuccess: () => setPendingLeaveGroupId(null),
      onError: () => {
        notifications.show({
          title: "Error",
          message: "Failed to leave group. Please try again.",
          color: "red",
        });
        setPendingLeaveGroupId(null);
      },
    });
  };

  if (allGroupsLoading) {
    return (
      <Center py="xl" data-testid="all-groups-loading">
        <Loader />
      </Center>
    );
  }

  if (allGroupsError) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        color="red"
        data-testid="all-groups-error"
      >
        Failed to load groups. Please try again.
      </Alert>
    );
  }

  if (!allGroups || allGroups.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="xs">
          <IconUsersGroup size={40} stroke={1.2} />
          <Text c="dimmed">No groups available.</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <>
      <GroupsTable
        groups={allGroups}
        memberGroupIds={memberGroupIds}
        pendingRequestGroupIds={pendingRequestGroupIds}
        onJoin={handleJoin}
        onLeave={setPendingLeaveGroupId}
        joinLoadingGroupId={
          requestMutation.isPending
            ? (requestMutation.variables?.groupId ?? null)
            : null
        }
        onRowClick={(id) => navigate(`/groups/${id}`)}
      />

      <Modal
        opened={pendingLeaveGroupId !== null}
        onClose={() => setPendingLeaveGroupId(null)}
        title="Leave group"
        data-testid="leave-group-modal"
      >
        <Text>Are you sure you want to leave this group?</Text>
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={() => setPendingLeaveGroupId(null)}
            data-testid="leave-group-back-btn"
          >
            Back
          </Button>
          <Button
            color="red"
            loading={leaveMutation.isPending}
            onClick={handleConfirmLeave}
            data-testid="leave-group-confirm-btn"
          >
            Confirm
          </Button>
        </Group>
      </Modal>
    </>
  );
}

/**
 * Tab panel showing the groups associated with the authenticated user.
 * System admins see all groups; regular users see only their own groups.
 */
function MyGroupsTab(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingLeaveGroupId, setPendingLeaveGroupId] = useState<string | null>(
    null,
  );

  const {
    data: myGroupsData,
    isLoading: myGroupsLoading,
    isError: myGroupsError,
  } = useMyGroups(user?.sub ?? "");

  const isLoading = myGroupsLoading;
  const isError = myGroupsError;
  const groups = myGroupsData;

  const leaveMutation = useLeaveGroup(pendingLeaveGroupId ?? "");
  const requestMutation = useRequestMembership();
  const { data: myPendingRequests } = useMyRequests("PENDING");

  const pendingRequestGroupIds = new Set(
    (myPendingRequests ?? []).map((r) => r.groupId),
  );

  /**
   * Submits a membership request for the given group and notifies on success or failure.
   *
   * @param groupId - The ID of the group to request membership for.
   */
  const handleJoin = (groupId: string) => {
    requestMutation.mutate(
      { groupId },
      {
        onSuccess: () => {
          notifications.show({
            title: "Request submitted",
            message: "Your membership request has been submitted.",
            color: "green",
          });
        },
        onError: () => {
          notifications.show({
            title: "Error",
            message: "Failed to submit membership request. Please try again.",
            color: "red",
          });
        },
      },
    );
  };

  /**
   * Confirms and executes the leave action for the pending group.
   */
  const handleConfirmLeave = () => {
    leaveMutation.mutate(undefined, {
      onSuccess: () => setPendingLeaveGroupId(null),
      onError: () => {
        notifications.show({
          title: "Error",
          message: "Failed to leave group. Please try again.",
          color: "red",
        });
        setPendingLeaveGroupId(null);
      },
    });
  };

  if (isLoading) {
    return (
      <Center py="xl" data-testid="groups-loading">
        <Loader />
      </Center>
    );
  }

  if (isError) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        color="red"
        data-testid="groups-error"
      >
        Failed to load groups. Please try again.
      </Alert>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="xs">
          <IconUsersGroup size={40} stroke={1.2} />
          <Text c="dimmed">You do not belong to any groups yet.</Text>
        </Stack>
      </Center>
    );
  }

  const memberGroupIds = new Set((groups ?? []).map((g) => g.id));

  return (
    <>
      <GroupsTable
        groups={groups}
        memberGroupIds={memberGroupIds}
        pendingRequestGroupIds={pendingRequestGroupIds}
        onJoin={handleJoin}
        onLeave={setPendingLeaveGroupId}
        joinLoadingGroupId={
          requestMutation.isPending
            ? (requestMutation.variables?.groupId ?? null)
            : null
        }
        onRowClick={(id) => navigate(`/groups/${id}`)}
      />

      <ConfirmActionModal
        opened={pendingLeaveGroupId !== null}
        onClose={() => setPendingLeaveGroupId(null)}
        onConfirm={handleConfirmLeave}
        title="Leave group"
        message="Are you sure you want to leave this group?"
        confirmLabel="Leave"
        confirmLoading={leaveMutation.isPending}
        data-testid="leave-group-modal"
        cancelButtonTestId="leave-group-back-btn"
        confirmButtonTestId="leave-group-confirm-btn"
      />
    </>
  );
}

/**
 * Tab panel showing all membership requests belonging to the authenticated user,
 * with a status filter (defaults to PENDING) and a cancel action for pending requests.
 * System admins also see an Approve button, allowing them to self-approve.
 */
function MyRequestsTab(): JSX.Element {
  const { isSystemAdmin } = useAuth();
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [approveRequest, setApproveRequest] =
    useState<MyMembershipRequest | null>(null);

  const cancelMutation = useCancelMembershipRequest();
  const approveMutation = useApproveMembershipRequest(
    approveRequest?.groupId ?? "",
  );

  /**
   * Submits the cancel request after the user confirms the action in the dialog.
   */
  const handleConfirmCancel = () => {
    if (!cancelConfirmId) return;
    cancelMutation.mutate(cancelConfirmId, {
      onSuccess: () => setCancelConfirmId(null),
      onError: () => {
        notifications.show({
          title: "Error",
          message: "Failed to cancel membership request. Please try again.",
          color: "red",
        });
        setCancelConfirmId(null);
      },
    });
  };

  /**
   * Submits the approve mutation after the user confirms in the modal.
   */
  const handleConfirmApprove = () => {
    if (!approveRequest) return;
    approveMutation.mutate(
      { requestId: approveRequest.id },
      {
        onSuccess: () => {
          setApproveRequest(null);
          notifications.show({
            title: "Request approved",
            message: "You have been added to the group.",
            color: "green",
          });
        },
        onError: () => {
          notifications.show({
            title: "Error",
            message: "Failed to approve membership request. Please try again.",
            color: "red",
          });
          setApproveRequest(null);
        },
      },
    );
  };

  const columns = makeMyRequestColumns(
    (id) => setCancelConfirmId(id),
    isSystemAdmin ? (r) => setApproveRequest(r) : undefined,
  );

  return (
    <>
      <RequestsTable
        fetchData={(status) => useMyRequests(status)}
        columns={columns}
      />

      <ConfirmActionModal
        opened={cancelConfirmId !== null}
        onClose={() => setCancelConfirmId(null)}
        onConfirm={handleConfirmCancel}
        title="Cancel membership request"
        message="Are you sure you want to cancel this membership request?"
        confirmLabel="Cancel request"
        confirmLoading={cancelMutation.isPending}
        data-testid="cancel-request-modal"
        cancelButtonTestId="cancel-request-back-btn"
        confirmButtonTestId="cancel-request-confirm-btn"
      />

      <ConfirmActionModal
        opened={approveRequest !== null}
        onClose={() => setApproveRequest(null)}
        onConfirm={handleConfirmApprove}
        title="Approve membership request"
        message={
          <Text>
            Approve your own request to join{" "}
            <strong>{approveRequest?.groupName}</strong>?
          </Text>
        }
        confirmLabel="Approve"
        confirmColor="green"
        confirmLoading={approveMutation.isPending}
        data-testid="my-approve-request-modal"
        cancelButtonTestId="my-approve-request-back-btn"
        confirmButtonTestId="my-approve-request-confirm-btn"
      />
    </>
  );
}

/**
 * Main groups page at `/groups`. Displays a tabbed interface showing the
 * authenticated user's groups and their membership requests.
 */
export function GroupsPage(): JSX.Element {
  const { isSystemAdmin } = useAuth();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Groups"
        description="Manage groups and memberships."
        actions={
          isSystemAdmin ? (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateGroupOpen(true)}
              data-testid="create-group-btn"
            >
              Create group
            </Button>
          ) : undefined
        }
      />

      <CreateGroupModal
        opened={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />

      <PanelCard>
        <Tabs defaultValue="my-groups">
          <Tabs.List>
            <Tabs.Tab value="my-groups">My groups</Tabs.Tab>
            <Tabs.Tab value="my-requests">My requests</Tabs.Tab>
            <Tabs.Tab value="all-groups">All groups</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="my-groups" pt="md">
            <MyGroupsTab />
          </Tabs.Panel>

          <Tabs.Panel value="my-requests" pt="md">
            <MyRequestsTab />
          </Tabs.Panel>

          <Tabs.Panel value="all-groups" pt="md">
            <AllGroupsTab />
          </Tabs.Panel>
        </Tabs>
      </PanelCard>
    </Stack>
  );
}
