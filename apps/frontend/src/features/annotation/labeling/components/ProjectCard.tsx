import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { FC } from "react";

interface FieldSchema {
  id: string;
  [key: string]: unknown;
}

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description?: string;
    status: string;
    updated_at: string;
    field_schema?: FieldSchema[];
    _count?: { documents: number };
  };
  onClick?: () => void;
}

export const ProjectCard: FC<ProjectCardProps> = ({ project, onClick }) => {
  return (
    <Card
      withBorder
      padding="lg"
      style={{ cursor: "pointer" }}
      onClick={onClick}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600} size="lg">
            {project.name}
          </Text>
          <Badge
            variant="light"
            color={
              project.status === "active"
                ? "blue"
                : project.status === "training"
                  ? "yellow"
                  : "gray"
            }
          >
            {project.status}
          </Badge>
        </Group>

        {project.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {project.description}
          </Text>
        )}

        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {project.field_schema?.length || 0} fields
          </Text>
          <Text size="xs" c="dimmed">
            •
          </Text>
          <Text size="xs" c="dimmed">
            {project._count?.documents || 0} documents
          </Text>
        </Group>

        <Text size="xs" c="dimmed">
          Updated {new Date(project.updated_at).toLocaleDateString()}
        </Text>
      </Stack>
    </Card>
  );
};
