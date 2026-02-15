import { Badge, Button, Group, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useState } from "react";
import type { ScheduleConfig as ScheduleConfigType } from "../hooks/useSchedule";
import { useConfigureSchedule, useScheduleInfo } from "../hooks/useSchedule";

/**
 * Schedule configuration component for benchmark definitions
 * See US-035: Scheduled & Nightly Runs
 */
interface ScheduleConfigProps {
  projectId: string;
  definitionId: string;
  initialEnabled?: boolean;
  initialCron?: string;
}

export function ScheduleConfig({
  projectId,
  definitionId,
  initialEnabled = false,
  initialCron = "",
}: ScheduleConfigProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [cron, setCron] = useState(initialCron);
  const [error, setError] = useState<string | null>(null);

  const configureSchedule = useConfigureSchedule(projectId, definitionId);
  const { data: scheduleInfo } = useScheduleInfo(projectId, definitionId);

  const handleSave = async () => {
    if (enabled && !cron) {
      setError("Cron expression is required when schedule is enabled");
      return;
    }

    setError(null);

    const config: ScheduleConfigType = {
      enabled,
      cron: enabled ? cron : undefined,
    };

    try {
      await configureSchedule.mutateAsync(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to configure schedule");
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group>
          <IconClock size={20} />
          <Text fw={500}>Scheduled Runs</Text>
        </Group>
        {scheduleInfo && !scheduleInfo.paused && (
          <Badge color="green" variant="light">
            Active
          </Badge>
        )}
        {scheduleInfo?.paused && (
          <Badge color="gray" variant="light">
            Paused
          </Badge>
        )}
      </Group>

      <Switch
        label="Enable automatic scheduled runs"
        checked={enabled}
        onChange={(event) => {
          setEnabled(event.currentTarget.checked);
          setError(null);
        }}
      />

      {enabled && (
        <TextInput
          label="Cron Expression"
          description="Schedule pattern (e.g., '0 2 * * *' for daily at 2 AM)"
          placeholder="0 2 * * *"
          value={cron}
          onChange={(event) => {
            setCron(event.currentTarget.value);
            setError(null);
          }}
          error={error}
        />
      )}

      {scheduleInfo && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Schedule Status
          </Text>
          <Text size="sm">
            <strong>Schedule ID:</strong> {scheduleInfo.scheduleId}
          </Text>
          <Text size="sm">
            <strong>Cron:</strong> {scheduleInfo.cron || "Not set"}
          </Text>
          <Text size="sm">
            <strong>Next Run:</strong> {formatDate(scheduleInfo.nextRunTime)}
          </Text>
          <Text size="sm">
            <strong>Last Run:</strong> {formatDate(scheduleInfo.lastRunTime)}
          </Text>
        </Stack>
      )}

      <Group>
        <Button
          onClick={handleSave}
          loading={configureSchedule.isPending}
          disabled={enabled && !cron}
        >
          Save Schedule
        </Button>
      </Group>
    </Stack>
  );
}
