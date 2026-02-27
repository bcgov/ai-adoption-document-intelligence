import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import type { JSX } from "react";
import { useAuth } from "../auth/AuthContext";

/**
 * Page shown to authenticated users who have no group memberships.
 * Users are redirected here by the `NoGroupGuard` when they try to access
 * protected application routes without belonging to any group.
 */
export function RequestMembershipPage(): JSX.Element {
  const { logout } = useAuth();

  return (
    <Center mih="100vh">
      <Stack align="center" gap="lg" maw={480} px="md">
        <IconUsers size={64} stroke={1.2} />
        <Title order={2} ta="center">
          No group memberships
        </Title>
        <Text c="dimmed" ta="center">
          Your account does not belong to any groups. You must be a member of at
          least one group to access the application.
        </Text>
        <Text c="dimmed" ta="center" size="sm">
          Contact an administrator to request access, or use the button below to
          sign out.
        </Text>
        <Button variant="light" color="red" onClick={() => logout()}>
          Sign out
        </Button>
      </Stack>
    </Center>
  );
}
