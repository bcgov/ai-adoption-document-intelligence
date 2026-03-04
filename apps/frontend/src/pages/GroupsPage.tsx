import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconUsersGroup } from "@tabler/icons-react";
import type { JSX } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  makeMyRequestColumns,
  RequestsTable,
} from "../components/group/RequestsTable";
import {
  useAllGroups,
  useCancelMembershipRequest,
  useMyGroups,
  useMyRequests,
} from "../data/hooks/useGroups";

/**
 * Tab panel showing the groups associated with the authenticated user.
 * System admins see all groups; regular users see only their own groups.
 */
function MyGroupsTab(): JSX.Element {
  const { user, isSystemAdmin } = useAuth();
  const navigate = useNavigate();

  const {
    data: myGroups,
    isLoading: myGroupsLoading,
    isError: myGroupsError,
  } = useMyGroups(user?.sub ?? "");

  const {
    data: allGroups,
    isLoading: allGroupsLoading,
    isError: allGroupsError,
  } = useAllGroups();

  const groups = isSystemAdmin ? allGroups : myGroups;
  const isLoading = isSystemAdmin ? allGroupsLoading : myGroupsLoading;
  const isError = isSystemAdmin ? allGroupsError : myGroupsError;

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

  return (
    <Table highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Description</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {groups.map((group) => (
          <Table.Tr
            key={group.id}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/groups/${group.id}`)}
          >
            <Table.Td>{group.name}</Table.Td>
            <Table.Td>{group.description}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
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
  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>Groups</Title>
        <Text c="dimmed" size="sm">
          Manage groups and memberships.
        </Text>
      </Stack>

      <Tabs defaultValue="my-groups">
        <Tabs.List>
          <Tabs.Tab value="my-groups">My Groups</Tabs.Tab>
          <Tabs.Tab value="my-requests">My Requests</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="my-groups" pt="md">
          <MyGroupsTab />
        </Tabs.Panel>

        <Tabs.Panel value="my-requests" pt="md">
          <MyRequestsTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
