import {
  ActionIcon,
  Badge,
  Card,
  Code,
  CopyButton,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { FC } from "react";
import type { TemplateModelStatus } from "../types/training.types";

interface FieldSchema {
  id: string;
  [key: string]: unknown;
}

interface ActiveTrainedModelSlice {
  id: string;
  model_id: string;
  version: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
}

interface ModelCardProps {
  model: {
    id: string;
    name: string;
    model_id: string;
    description?: string;
    status: string;
    updated_at: string;
    field_schema?: FieldSchema[];
    _count?: { documents: number };
    active_trained_model?: ActiveTrainedModelSlice | null;
  };
  onClick?: () => void;
}

const getStatusBadgeColor = (status: string): string => {
  const statusColors: Record<TemplateModelStatus, string> = {
    draft: "blue",
    training: "yellow",
    trained: "green",
    failed: "red",
  };
  return statusColors[status as TemplateModelStatus] || "gray";
};

export const ModelCard: FC<ModelCardProps> = ({ model, onClick }) => {
  // Prefer the active trained version's model id (e.g. km-invoice-v3) so the
  // copy button hands the user the actual Azure model name. Falls back to
  // the bare template model_id when nothing has been trained yet.
  const active = model.active_trained_model;
  const displayedModelId = active?.model_id ?? model.model_id;
  const copyTooltip = active
    ? `Copy active model ID (v${active.version})`
    : "Copy model ID";
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
            {model.name}
          </Text>
          <Badge variant="light" color={getStatusBadgeColor(model.status)}>
            {model.status}
          </Badge>
        </Group>

        <Group gap="xs">
          <Code>{displayedModelId}</Code>
          {active && <Code c="dimmed">v{active.version}</Code>}
          <CopyButton value={displayedModelId}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Copied!" : copyTooltip}>
                <ActionIcon
                  color={copied ? "green" : "gray"}
                  variant="subtle"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    copy();
                  }}
                >
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        {model.description && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {model.description}
          </Text>
        )}

        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {model.field_schema?.length || 0} fields
          </Text>
          <Text size="xs" c="dimmed">
            •
          </Text>
          <Text size="xs" c="dimmed">
            {model._count?.documents || 0} documents
          </Text>
        </Group>

        <Text size="xs" c="dimmed">
          Updated {new Date(model.updated_at).toLocaleDateString()}
        </Text>
      </Stack>
    </Card>
  );
};
