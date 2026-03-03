import { Stack, Text, Title } from "@mantine/core";
import type { JSX } from "react";

/**
 * Main groups page. Displays the list of groups and allows navigation
 * to individual group detail pages.
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
    </Stack>
  );
}
