import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconUsersGroup } from "@tabler/icons-react";
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
  useAllGroups,
  useCancelMembershipRequest,
  useCreateGroup,
  useLeaveGroup,
  useMyGroups,
  useMyRequests,
  useRequestMembership,
} from "../data/hooks/useGroups";

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
            title: "Group Created",
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
      title="Create Group"
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
            title: "Request Submitted",
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
        title="Leave Group"
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

  const { data: groups, isLoading, isError } = useMyGroups(user?.sub ?? "");

  const leaveMutation = useLeaveGroup(pendingLeaveGroupId ?? "");

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

  const memberGroupIds = new Set(groups.map((g) => g.id));

  return (
    <>
      <GroupsTable
        groups={groups}
        memberGroupIds={memberGroupIds}
        pendingRequestGroupIds={new Set()}
        onLeave={setPendingLeaveGroupId}
        onRowClick={(id) => navigate(`/groups/${id}`)}
      />

      <Modal
        opened={pendingLeaveGroupId !== null}
        onClose={() => setPendingLeaveGroupId(null)}
        title="Leave Group"
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
 * Tab panel showing all membership requests belonging to the authenticated user,
 * with a status filter (defaults to PENDING) and a cancel action for pending requests.
 */
function MyRequestsTab(): JSX.Element {
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const cancelMutation = useCancelMembershipRequest();

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

  const columns = makeMyRequestColumns((id) => setCancelConfirmId(id));

  return (
    <>
      <RequestsTable
        fetchData={(status) => useMyRequests(status)}
        columns={columns}
      />

      <Modal
        opened={cancelConfirmId !== null}
        onClose={() => setCancelConfirmId(null)}
        title="Cancel Membership Request"
        data-testid="cancel-request-modal"
      >
        <Text>Are you sure you want to cancel this membership request?</Text>
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={() => setCancelConfirmId(null)}
            data-testid="cancel-request-back-btn"
          >
            Back
          </Button>
          <Button
            color="red"
            loading={cancelMutation.isPending}
            onClick={handleConfirmCancel}
            data-testid="cancel-request-confirm-btn"
          >
            Confirm
          </Button>
        </Group>
      </Modal>
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
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={2}>Groups</Title>
          <Text c="dimmed" size="sm">
            Manage groups and memberships.
          </Text>
        </Stack>
        {isSystemAdmin && (
          <Button
            onClick={() => setCreateGroupOpen(true)}
            data-testid="create-group-btn"
          >
            Create Group
          </Button>
        )}
      </Group>

      <CreateGroupModal
        opened={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
      />

      <Tabs defaultValue="my-groups">
        <Tabs.List>
          <Tabs.Tab value="my-groups">My Groups</Tabs.Tab>
          <Tabs.Tab value="my-requests">My Requests</Tabs.Tab>
          <Tabs.Tab value="all-groups">All Groups</Tabs.Tab>
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
    </Stack>
  );
}
