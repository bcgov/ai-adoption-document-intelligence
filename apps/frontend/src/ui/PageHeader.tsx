import type { ReactNode } from "react";
import { Badge } from "./Badge";
import { Group, Stack } from "./index";
import { Text } from "./Text";
import { Title } from "./Title";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional actions (buttons) rendered beside the date badge */
  actions?: ReactNode;
  /** When true, show the date badge. Default false. */
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
  showDateBadge = false,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap">
      <Stack
        className="bcds-page-header__title-block"
        style={{ gap: "var(--layout-margin-xsmall)" }}
      >
        <Title order={2} mt={0} mb={0}>
          {title}
        </Title>
        {description ? (
          <Text c="dimmed" size="sm" mt={0} mb={0}>
            {description}
          </Text>
        ) : null}
      </Stack>
      <Group gap="md" align="center" className="bcds-page-header__meta">
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
