import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type JSX, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useGroup } from "../auth/GroupContext";
import { GroupRequestsTab } from "../components/group/GroupRequestsTab";
import { MembersTab } from "../components/group/MembersTab";
import {
  useAllGroups,
  useLeaveGroup,
  useMyGroups,
  useMyRequests,
  useRequestMembership,
  useUpdateGroup,
} from "../data/hooks/useGroups";

/**
 * Page shown at `/groups/:groupId`. Displays group details and the Members tab
 * for users who belong to the group, group admins, or system admins.
 * Group admins and system admins also see the Membership Requests tab.
 */
export function GroupDetailPage(): JSX.Element {
  const match = useMatch("/groups/:groupId");
  const groupId = match?.params.groupId;
  const { user, isSystemAdmin } = useAuth();
  const { availableGroups } = useGroup();
  const navigate = useNavigate();

  const isMember = availableGroups.some((g) => g.id === groupId);
  const canViewMembers = isSystemAdmin || isMember;

  const [leaveGroupOpen, setLeaveGroupOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("members");

  const { data: myGroups } = useMyGroups(user?.sub ?? "");

  const { data: allGroups } = useAllGroups();

  const leaveMutation = useLeaveGroup(groupId ?? "");
  const updateMutation = useUpdateGroup(groupId ?? "");
  const requestMutation = useRequestMembership();
  const { data: myPendingRequests } = useMyRequests("PENDING");

  const hasPendingRequest = (myPendingRequests ?? []).some(
    (r) => r.groupId === groupId,
  );

  const handleLeaveConfirm = () => {
    leaveMutation.mutate(undefined, {
      onSuccess: () => {
        navigate("/groups");
      },
      onError: () => {
        notifications.show({
          title: "Error",
          message: "Failed to leave group. Please try again.",
          color: "red",
        });
        setLeaveGroupOpen(false);
      },
    });
  };

  const isAdmin =
    isSystemAdmin ||
    (myGroups?.some((g) => g.id === groupId && g.role === "ADMIN") ?? false);

  /**
   * Opens the edit group modal pre-populated with the group's current values.
   */
  const handleOpenEditGroup = () => {
    setEditName(groupName === groupId ? "" : groupName);
    setEditDescription(groupDescription ?? "");
    setEditError(null);
    setEditGroupOpen(true);
  };

  /**
   * Submits the edit group form, calling PUT /api/groups/:groupId.
   */
  const handleEditGroupSubmit = () => {
    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    setEditError(null);
    updateMutation.mutate(
      {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      },
      {
        onSuccess: () => {
          setEditGroupOpen(false);
          notifications.show({
            title: "Group Updated",
            message: "The group has been updated successfully.",
            color: "green",
          });
        },
        onError: (err) => {
          setEditError(
            err instanceof Error ? err.message : "Failed to update group.",
          );
        },
      },
    );
  };

  const groupName =
    allGroups?.find((g) => g.id === groupId)?.name ?? groupId ?? "Group";

  const groupDescription = allGroups?.find(
    (g) => g.id === groupId,
  )?.description;

  /**
   * Submits a membership request for the current user to join this group.
   */
  const handleJoin = () => {
    if (!groupId) return;
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

  if (!groupId) {
    return (
      <Alert color="red">
        <Text>Invalid group ID.</Text>
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={2}>{groupName}</Title>
          <Text c="dimmed" size="sm">
            Group details and membership.
          </Text>
        </Stack>
        <Group gap="xs">
          {isSystemAdmin && (
            <Button
              variant="outline"
              onClick={handleOpenEditGroup}
              data-testid="edit-group-btn"
            >
              Edit Group
            </Button>
          )}
          {isMember && (
            <Button
              variant="outline"
              color="red"
              onClick={() => setLeaveGroupOpen(true)}
              data-testid="leave-group-btn"
            >
              Leave Group
            </Button>
          )}
        </Group>
        {!isMember && !isSystemAdmin && (
          <Button
            variant="outline"
            loading={requestMutation.isPending}
            disabled={hasPendingRequest}
            onClick={handleJoin}
            data-testid="join-group-btn"
          >
            {hasPendingRequest ? "Request Pending" : "Join"}
          </Button>
        )}
      </Group>

      {groupDescription && (
        <Text data-testid="group-description">{groupDescription}</Text>
      )}

      {canViewMembers && (
        <Tabs value={activeTab} onChange={(v) => setActiveTab(v ?? "members")}>
          <Tabs.List>
            <Tabs.Tab value="members">Members</Tabs.Tab>
            {isAdmin && (
              <Tabs.Tab value="requests">Membership Requests</Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="members" pt="md">
            <MembersTab groupId={groupId} isAdmin={isAdmin} />
          </Tabs.Panel>
          {isAdmin && (
            <Tabs.Panel value="requests" pt="md">
              <GroupRequestsTab groupId={groupId} isAdmin={isAdmin} />
            </Tabs.Panel>
          )}
        </Tabs>
      )}

      <Modal
        opened={editGroupOpen}
        onClose={() => setEditGroupOpen(false)}
        title="Edit Group"
        data-testid="edit-group-modal"
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            required
            value={editName}
            onChange={(e) => setEditName(e.currentTarget.value)}
            data-testid="edit-group-name"
          />
          <Textarea
            label="Description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.currentTarget.value)}
            data-testid="edit-group-description"
          />
          {editError && (
            <Text c="red" size="sm" data-testid="edit-group-error">
              {editError}
            </Text>
          )}
          <Group justify="flex-end" mt="xs">
            <Button
              variant="default"
              onClick={() => setEditGroupOpen(false)}
              data-testid="edit-group-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              loading={updateMutation.isPending}
              onClick={handleEditGroupSubmit}
              data-testid="edit-group-submit-btn"
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={leaveGroupOpen}
        onClose={() => setLeaveGroupOpen(false)}
        title="Leave Group"
        data-testid="leave-group-modal"
      >
        <Text>Are you sure you want to leave this group?</Text>
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={() => setLeaveGroupOpen(false)}
            data-testid="leave-group-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            color="red"
            loading={leaveMutation.isPending}
            onClick={handleLeaveConfirm}
            data-testid="leave-group-confirm-btn"
          >
            Leave
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
