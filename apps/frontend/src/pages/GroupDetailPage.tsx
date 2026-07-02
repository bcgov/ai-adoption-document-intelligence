import { type JSX, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { GroupRequestsTab } from "../components/group/GroupRequestsTab";
import { MembersTab } from "../components/group/MembersTab";
import {
  useAllGroups,
  useDeleteGroup,
  useLeaveGroup,
  useMyGroups,
  useMyRequests,
  useRequestMembership,
  useUpdateGroup,
} from "../data/hooks/useGroups";
import {
  Alert,
  Button,
  ConfirmActionModal,
  Group,
  Menu,
  Modal,
  notifications,
  PageHeader,
  PanelCard,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "../ui";

/**
 * Page shown at `/groups/:groupId`. Displays group details and the Members tab
 * for users who belong to the group, group admins, or system admins.
 * Group admins and system admins also see the Membership requests tab.
 */
export function GroupDetailPage(): JSX.Element {
  const match = useMatch("/groups/:groupId");
  const groupId = match?.params.groupId;
  const { user, isSystemAdmin } = useAuth();
  const navigate = useNavigate();

  const [leaveGroupOpen, setLeaveGroupOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("members");

  const { data: myGroups } = useMyGroups(user?.sub ?? "");

  const isMember = (myGroups ?? []).some((g) => g.id === groupId);
  const canViewMembers = isSystemAdmin || isMember;

  const { data: allGroups } = useAllGroups();

  const leaveMutation = useLeaveGroup(groupId ?? "");
  const updateMutation = useUpdateGroup(groupId ?? "");
  const deleteMutation = useDeleteGroup(groupId ?? "");
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
          message: "Failed to leave group. please try again.",
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
   * Confirms and executes the soft-delete of the current group, then navigates
   * back to the groups listing.
   */
  const handleDeleteConfirm = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => {
        navigate("/groups");
      },
      onError: () => {
        notifications.show({
          title: "Error",
          message: "Failed to delete group. please try again.",
          color: "red",
        });
        setDeleteGroupOpen(false);
      },
    });
  };

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
            title: "Group updated",
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
            title: "Request submitted",
            message: "Your membership request has been submitted.",
            color: "green",
          });
        },
        onError: () => {
          notifications.show({
            title: "Error",
            message: "Failed to submit membership request. please try again.",
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

  const actionsMenu = (
    <Menu shadow="md" width={180} position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton
          className="bcds-menu-outline-trigger"
          data-testid="group-actions-menu-btn"
        >
          Actions
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {isSystemAdmin && (
          <Menu.Item
            onClick={handleOpenEditGroup}
            data-testid="edit-group-menu-item"
          >
            Edit group
          </Menu.Item>
        )}
        {isMember && (
          <Menu.Item
            color="red"
            onClick={() => setLeaveGroupOpen(true)}
            data-testid="leave-group-menu-item"
          >
            Leave group
          </Menu.Item>
        )}
        {!isMember && !isSystemAdmin && (
          <Menu.Item
            onClick={handleJoin}
            disabled={hasPendingRequest || requestMutation.isPending}
            data-testid="join-group-menu-item"
          >
            {hasPendingRequest ? "request pending" : "join"}
          </Menu.Item>
        )}
        {isSystemAdmin && (
          <>
            <Menu.Divider />
            <Menu.Item
              color="red"
              onClick={() => setDeleteGroupOpen(true)}
              data-testid="delete-group-menu-item"
            >
              Delete group
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title={groupName}
        description={
          groupDescription
            ? `${groupDescription} — membership and settings`
            : "Group details and membership."
        }
        actions={actionsMenu}
      />

      {canViewMembers && (
        <PanelCard>
          <Tabs
            value={activeTab}
            onChange={(v) => setActiveTab(v ?? "members")}
          >
            <Tabs.List>
              <Tabs.Tab value="members">Members</Tabs.Tab>
              {isAdmin && (
                <Tabs.Tab value="requests">Membership requests</Tabs.Tab>
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
        </PanelCard>
      )}

      <Modal
        opened={editGroupOpen}
        onClose={() => setEditGroupOpen(false)}
        title="Edit group"
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

      <ConfirmActionModal
        opened={deleteGroupOpen}
        onClose={() => setDeleteGroupOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete group"
        message="Are you sure you want to delete this group? This action will disable the group and cannot be easily undone."
        confirmLabel="Delete"
        confirmLoading={deleteMutation.isPending}
        data-testid="delete-group-modal"
        cancelButtonTestId="delete-group-cancel-btn"
        confirmButtonTestId="delete-group-confirm-btn"
      />

      <ConfirmActionModal
        opened={leaveGroupOpen}
        onClose={() => setLeaveGroupOpen(false)}
        onConfirm={handleLeaveConfirm}
        title="Leave group"
        message="Are you sure you want to leave this group?"
        confirmLabel="Leave"
        confirmLoading={leaveMutation.isPending}
        data-testid="leave-group-modal"
        cancelButtonTestId="leave-group-cancel-btn"
        confirmButtonTestId="leave-group-confirm-btn"
      />
    </Stack>
  );
}
