import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCircleCheck,
  IconLogout,
  IconUsers,
} from "@tabler/icons-react";
import type { JSX } from "react";
import { useAuth } from "../auth/AuthContext";
import { GroupsTable } from "../components/group/GroupsTable";
import { useBootstrapStatus } from "../data/hooks/useBootstrap";
import {
  useAllGroups,
  useMyRequests,
  useRequestMembership,
} from "../data/hooks/useGroups";
import { SetupPage } from "./SetupPage";

/**
 * Page shown to authenticated users who have no group memberships.
 * Displays a filterable, sortable table of all available groups, each with a
 * per-row button to submit a membership request for administrator review.
 *
 * When the system has not been bootstrapped yet (zero admins), this page
 * renders the SetupPage instead of the normal membership request flow.
 *
 * Users are redirected here by the `NoGroupGuard` when they try to access
 * protected application routes without belonging to any group.
 */
export function RequestMembershipPage(): JSX.Element {
  const { logout } = useAuth();
  const { data: bootstrapStatus, isLoading: bootstrapLoading } =
    useBootstrapStatus(true);
  const {
    data: groups,
    isLoading: groupsLoading,
    isError: groupsError,
  } = useAllGroups();
  const { data: pendingRequests } = useMyRequests("PENDING");
  const requestMutation = useRequestMembership();

  const pendingRequestGroupIds = new Set(
    (pendingRequests ?? []).map((r) => r.groupId),
  );

  const handleRequest = (groupId: string): void => {
    requestMutation.mutate({ groupId });
  };

  // While checking bootstrap status, show a loader (prevents flash)
  if (bootstrapLoading) {
    return (
      <Center mih="100vh">
        <Loader data-testid="bootstrap-check-loader" />
      </Center>
    );
  }

  // If bootstrap is needed, show the setup page instead
  if (bootstrapStatus?.needed) {
    return <SetupPage />;
  }

  return (
    <>
      <Box pos="fixed" top={16} right={16} style={{ zIndex: 100 }}>
        <Button
          variant="light"
          color="red"
          leftSection={<IconLogout size={16} />}
          onClick={() => logout()}
          data-testid="sign-out-button"
        >
          Sign out
        </Button>
      </Box>

      <Center mih="100vh" pt="xl">
        <Stack gap="lg" w="100%" maw={700} px="md">
          <Group gap="md">
            <IconUsers size={40} stroke={1.2} />
            <Stack gap={0}>
              <Title order={2}>Request group membership</Title>
              <Text c="dimmed" size="sm">
                Select a group to request access — an administrator will review
                your request before granting membership.
              </Text>
            </Stack>
          </Group>

          {/* Feedback alerts */}
          {requestMutation.isSuccess && (
            <Alert
              icon={<IconCircleCheck size={16} />}
              color="green"
              data-testid="request-success"
            >
              Your membership request has been submitted and is pending admin
              approval.
            </Alert>
          )}

          {requestMutation.isError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              data-testid="request-error"
            >
              {requestMutation.error
                ? requestMutation.error.message
                : "Failed to submit membership request. Please try again."}
            </Alert>
          )}

          {/* Groups table */}
          {groupsLoading && <Loader data-testid="groups-loader" />}

          {groupsError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              data-testid="groups-error"
            >
              Failed to load groups. Please refresh the page and try again.
            </Alert>
          )}

          {!groupsLoading && !groupsError && groups?.length === 0 && (
            <Text
              c="dimmed"
              ta="center"
              size="sm"
              data-testid="no-groups-message"
            >
              No groups are available. Contact an administrator.
            </Text>
          )}

          {!groupsLoading && !groupsError && !!groups?.length && (
            <GroupsTable
              groups={groups}
              memberGroupIds={new Set()}
              pendingRequestGroupIds={pendingRequestGroupIds}
              onJoin={handleRequest}
              onLeave={() => {
                // Users on this page have no memberships; Leave is never rendered
              }}
              joinLoadingGroupId={
                requestMutation.isPending
                  ? (requestMutation.variables?.groupId ?? null)
                  : null
              }
            />
          )}
        </Stack>
      </Center>
    </>
  );
}
