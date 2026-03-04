import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Select,
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
  useAllGroups,
  useCancelMembershipRequest,
  useMyGroups,
  useMyRequests,
} from "../data/hooks/useGroups";

const REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "DENIED",
  "CANCELLED",
] as const;
type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Maps a request status string to a Mantine badge colour */
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
  } = useMyGroups(user?.sub ?? "", { enabled: !isSystemAdmin });

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
  const [statusFilter, setStatusFilter] = useState<RequestStatus>("PENDING");
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

  const { data: requests, isLoading, isError } = useMyRequests(statusFilter);

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
        label="Status"
        value={statusFilter}
        data={REQUEST_STATUSES.map((s) => ({ value: s, label: s }))}
        onChange={(value) => {
          if (value && REQUEST_STATUSES.includes(value as RequestStatus)) {
            setStatusFilter(value as RequestStatus);
          }
        }}
        w={180}
        aria-label="Filter by status"
      />

      {requests && requests.length === 0 ? (
        <Center py="xl" data-testid="requests-empty">
          <Text c="dimmed">
            No {statusFilter.toLowerCase()} requests found.
          </Text>
        </Center>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Group</Table.Th>
              <Table.Th>Submitted</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Reason</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests?.map((request) => (
              <Table.Tr key={request.id}>
                <Table.Td>{request.groupName}</Table.Td>
                <Table.Td>
                  {new Date(request.createdAt).toLocaleDateString()}
                </Table.Td>
                <Table.Td>
                  <Badge color={statusColor(request.status)}>
                    {request.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{request.reason ?? "—"}</Table.Td>
                <Table.Td>
                  {request.status === "PENDING" && (
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => setCancelConfirmId(request.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

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
    </Stack>
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
