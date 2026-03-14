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
  IconSettings,
} from "@tabler/icons-react";
import type { JSX } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  useBootstrapStatus,
  usePerformBootstrap,
} from "../data/hooks/useBootstrap";

/**
 * Page shown to the deployer on first launch when no system admin exists.
 * Clicking "Setup" promotes them to admin and creates the Default group.
 * Only visible when bootstrap is needed AND the user's email matches
 * BOOTSTRAP_ADMIN_EMAIL on the backend.
 */
export function SetupPage(): JSX.Element {
  const { logout, user } = useAuth();
  const {
    data: status,
    isLoading: statusLoading,
    isError: statusError,
  } = useBootstrapStatus(true);
  const bootstrapMutation = usePerformBootstrap();

  const handleSetup = () => {
    bootstrapMutation.mutate(undefined, {
      onSuccess: () => {
        // Reload to re-fetch auth state and route to the main app
        window.location.href = "/";
      },
    });
  };

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
        <Stack gap="lg" w="100%" maw={500} px="md">
          <Group gap="md">
            <IconSettings size={40} stroke={1.2} />
            <Stack gap={0}>
              <Title order={2}>System Setup</Title>
              <Text c="dimmed" size="sm">
                This application has not been set up yet. As the designated
                administrator, you can initialize the system below.
              </Text>
            </Stack>
          </Group>

          {statusLoading && <Loader data-testid="bootstrap-loader" />}

          {statusError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              data-testid="bootstrap-error"
            >
              Failed to check setup status. Please refresh the page.
            </Alert>
          )}

          {bootstrapMutation.isSuccess && (
            <Alert
              icon={<IconCircleCheck size={16} />}
              color="green"
              data-testid="bootstrap-success"
            >
              System setup complete! Redirecting...
            </Alert>
          )}

          {bootstrapMutation.isError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              data-testid="bootstrap-mutation-error"
            >
              {bootstrapMutation.error?.message ?? "Setup failed. Please try again."}
            </Alert>
          )}

          {!statusLoading && !statusError && status?.eligible && (
            <Stack gap="sm">
              <Text size="sm">
                Logged in as <strong>{user?.profile.email}</strong>. Clicking
                the button below will:
              </Text>
              <Text size="sm" component="ul" pl="md">
                <li>Promote your account to system administrator</li>
                <li>Create a &quot;Default&quot; group with you as group admin</li>
              </Text>
              <Button
                size="lg"
                onClick={handleSetup}
                loading={bootstrapMutation.isPending}
                data-testid="setup-button"
              >
                Setup
              </Button>
            </Stack>
          )}

          {!statusLoading &&
            !statusError &&
            status &&
            !status.eligible &&
            status.needed && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="yellow"
                data-testid="not-eligible"
              >
                The system needs to be set up, but your account is not the
                designated bootstrap administrator. Please contact the person
                who deployed this instance.
              </Alert>
            )}
        </Stack>
      </Center>
    </>
  );
}
