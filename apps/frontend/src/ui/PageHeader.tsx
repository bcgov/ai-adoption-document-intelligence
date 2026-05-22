import { Group, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Badge } from "./Badge";
import { Text } from "./Text";
import { Title } from "./Title";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional actions (buttons) rendered beside the date badge */
  actions?: ReactNode;
  /** When false, omit the date badge. Default true. */
  showDateBadge?: boolean;
}

/**
 * Standard page shell: heading, optional description, date badge, optional actions.
 * Matches Processing Queue / Upload reference layout.
 */
export function PageHeader({
  title,
  description,
  actions,
  showDateBadge = true,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap">
      <Stack gap={2}>
        <Title order={2}>{title}</Title>
        {description ? (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        ) : null}
      </Stack>
      <Group gap="md" align="center">
        {actions}
        {showDateBadge ? (
          <Badge variant="outline" size="lg">
            {new Date().toLocaleDateString()}
          </Badge>
        ) : null}
      </Group>
    </Group>
  );
}
