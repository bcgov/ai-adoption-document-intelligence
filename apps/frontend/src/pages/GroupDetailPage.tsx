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
import { IconAlertCircle } from "@tabler/icons-react";
import { type JSX, useState } from "react";
import { useMatch } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useGroup } from "../auth/GroupContext";
import {
  type GroupMember,
  useGroupMembers,
  useMyGroups,
  useRemoveGroupMember,
} from "../data/hooks/useGroups";

interface MembersTabProps {
  groupId: string;
  isAdmin: boolean;
}

/**
 * Tab panel showing all members of the group.
 * Admins (group admin or system admin) see a Remove button per row.
 * Clicking Remove opens a confirmation dialog before the mutation is fired.
 *
 * @param props.groupId - The ID of the group whose members to display.
 * @param props.isAdmin - Whether the current user is a group admin or system admin.
 */
function MembersTab({ groupId, isAdmin }: MembersTabProps): JSX.Element {
  const [confirmMember, setConfirmMember] = useState<GroupMember | null>(null);
  const { data: members, isLoading, isError } = useGroupMembers(groupId);
  const removeMutation = useRemoveGroupMember(groupId);

  const handleRemoveConfirm = () => {
    if (!confirmMember) return;
    removeMutation.mutate(confirmMember.userId, {
      onSuccess: () => {
        setConfirmMember(null);
      },
      onError: () => {
        notifications.show({
          title: "Error",
          message: "Failed to remove member. Please try again.",
          color: "red",
        });
        setConfirmMember(null);
      },
    });
  };

  if (isLoading) {
    return (
      <Center py="xl" data-testid="members-loading">
        <Loader />
      </Center>
    );
  }

  if (isError) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        color="red"
        data-testid="members-error"
      >
        Failed to load members. Please try again.
      </Alert>
    );
  }

  if (!members || members.length === 0) {
    return (
      <Center py="xl" data-testid="members-empty">
        <Text c="dimmed">No members found.</Text>
      </Center>
    );
  }

  return (
    <>
      <Table highlightOnHover data-testid="members-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Email</Table.Th>
            <Table.Th>Joined</Table.Th>
            {isAdmin && <Table.Th>Actions</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.map((member) => (
            <Table.Tr key={member.userId}>
              <Table.Td>{member.email}</Table.Td>
              <Table.Td>
                {new Date(member.joinedAt).toLocaleDateString()}
              </Table.Td>
              {isAdmin && (
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    onClick={() => setConfirmMember(member)}
                    data-testid={`remove-btn-${member.userId}`}
                  >
                    Remove
                  </Button>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal
        opened={confirmMember !== null}
        onClose={() => setConfirmMember(null)}
        title="Remove Member"
        data-testid="remove-confirm-modal"
      >
        <Text>
          Are you sure you want to remove{" "}
          <Text span fw={700}>
            {confirmMember?.email}
          </Text>{" "}
          from this group?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={() => setConfirmMember(null)}
            data-testid="remove-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            color="red"
            loading={removeMutation.isPending}
            onClick={handleRemoveConfirm}
            data-testid="remove-confirm-btn"
          >
            Remove
          </Button>
        </Group>
      </Modal>
    </>
  );
}

/**
 * Page shown at `/groups/:groupId`. Displays group details and the Members tab
 * for users who belong to the group, group admins, or system admins.
 */
export function GroupDetailPage(): JSX.Element {
  const match = useMatch("/groups/:groupId");
  const groupId = match?.params.groupId;
  const { user, isSystemAdmin } = useAuth();
  const { availableGroups } = useGroup();

  const { data: myGroups } = useMyGroups(user?.sub ?? "");

  const isMember =
    isSystemAdmin || (availableGroups.some((g) => g.id === groupId) ?? false);

  const isAdmin =
    isSystemAdmin ||
    (myGroups?.some((g) => g.id === groupId && g.role === "ADMIN") ?? false);

  const groupName =
    availableGroups.find((g) => g.id === groupId)?.name ?? groupId ?? "Group";

  if (!groupId) {
    return (
      <Alert color="red">
        <Text>Invalid group ID.</Text>
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>{groupName}</Title>
        <Text c="dimmed" size="sm">
          Group details and membership.
        </Text>
      </Stack>

      <Tabs defaultValue="members">
        <Tabs.List>
          {isMember && <Tabs.Tab value="members">Members</Tabs.Tab>}
        </Tabs.List>

        {isMember && (
          <Tabs.Panel value="members" pt="md">
            <MembersTab groupId={groupId} isAdmin={isAdmin} />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
