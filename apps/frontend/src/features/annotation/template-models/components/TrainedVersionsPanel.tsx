import {
  IconAlertCircle,
  IconCheck,
  IconHistory,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { FC, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  DataTable,
  Group,
  Loader,
  notifications,
  Stack,
  Text,
  Tooltip,
} from "../../../../ui";
import { useTrainedVersions } from "../hooks/useTrainedVersions";
import { useTraining } from "../hooks/useTraining";
import {
  BuildMode,
  TrainedModelVersion,
  TrainingStatus,
} from "../types/training.types";
import { TrainedVersionSnapshotDrawer } from "./TrainedVersionSnapshotDrawer";

interface TrainedVersionsPanelProps {
  templateModelId: string;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function formatModeCell(v: TrainedModelVersion): string {
  if (v.buildMode === BuildMode.template) return "template";
  if (v.actualTrainingHours != null) {
    return `neural · ${v.actualTrainingHours.toFixed(2)}h used`;
  }
  if (v.maxTrainingHours != null) {
    return `neural · ${v.maxTrainingHours}h budget`;
  }
  return "neural";
}

export const TrainedVersionsPanel: FC<TrainedVersionsPanelProps> = ({
  templateModelId,
}) => {
  const { jobs } = useTraining(templateModelId);
  const trainingInProgress = jobs.some((j) =>
    [
      TrainingStatus.PENDING,
      TrainingStatus.UPLOADING,
      TrainingStatus.UPLOADED,
      TrainingStatus.TRAINING,
    ].includes(j.status),
  );
  const {
    versions,
    isLoading,
    refetch,
    activateVersion,
    isActivating,
    deleteVersion,
    isDeleting,
  } = useTrainedVersions(templateModelId, {
    pollWhileTraining: trainingInProgress,
  });
  const [drawerVersion, setDrawerVersion] =
    useState<TrainedModelVersion | null>(null);

  // When training transitions from active → idle, force one more refetch.
  // The polling-while-training window stops the moment trainingInProgress
  // flips false, which can happen *just* before the poller writes the new
  // row. Catching this transition guarantees the new version appears
  // without a manual refresh — and refreshes the template-model query so
  // the page header's "active model id" updates too.
  const queryClient = useQueryClient();
  const wasTraining = useRef(false);
  useEffect(() => {
    if (wasTraining.current && !trainingInProgress) {
      refetch();
      queryClient.invalidateQueries({
        queryKey: ["template-model", templateModelId],
      });
      queryClient.invalidateQueries({ queryKey: ["template-models"] });
    }
    wasTraining.current = trainingInProgress;
  }, [trainingInProgress, refetch, queryClient, templateModelId]);

  const handleActivate = async (version: TrainedModelVersion) => {
    try {
      await activateVersion(version.id);
      notifications.show({
        title: "Active version updated",
        message: `v${version.version} is now active.`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: "Failed to activate version",
        message: (error as Error).message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  const handleDelete = async (version: TrainedModelVersion) => {
    try {
      await deleteVersion(version.id);
      notifications.show({
        title: "Version deleted",
        message: `v${version.version} has been tombstoned and the azure model removed.`,
        color: "green",
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: "Could not delete version",
        message: (error as Error).message,
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    }
  };

  if (isLoading) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Loading versions…
        </Text>
      </Group>
    );
  }

  if (versions.length === 0) {
    return (
      <Alert color="gray" variant="light">
        No trained versions yet. Train this template model from the Training tab
        to create the first version.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {trainingInProgress && (
        <Alert color="blue" variant="light">
          A new training run is currently in progress. The next version will
          appear here once it completes.
        </Alert>
      )}
      <DataTable striped withTableBorder>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th style={{ width: 80 }}>Version</DataTable.Th>
            <DataTable.Th>Azure model id</DataTable.Th>
            <DataTable.Th style={{ width: 160 }}>Mode</DataTable.Th>
            <DataTable.Th style={{ width: 100 }}>Fields</DataTable.Th>
            <DataTable.Th>Trained</DataTable.Th>
            <DataTable.Th style={{ width: 120 }}>Status</DataTable.Th>
            <DataTable.Th style={{ width: 200 }} />
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {versions.map((v) => {
            const isDeleted = !!v.deletedAt;
            const blockActivateReason = isDeleted
              ? "Deleted versions can't be reactivated. Re-train instead."
              : null;
            return (
              <DataTable.Tr key={v.id}>
                <DataTable.Td>
                  <Text fw={600}>v{v.version}</Text>
                </DataTable.Td>
                <DataTable.Td>
                  <Text size="sm" ff="monospace">
                    {v.modelId}
                  </Text>
                </DataTable.Td>
                <DataTable.Td>
                  <Tooltip
                    label={
                      v.buildMode === BuildMode.neural &&
                      v.maxTrainingHours != null
                        ? `Budget: ${v.maxTrainingHours}h`
                        : ""
                    }
                    disabled={
                      v.buildMode === BuildMode.template ||
                      v.maxTrainingHours == null ||
                      v.actualTrainingHours == null
                    }
                  >
                    <Text size="sm">{formatModeCell(v)}</Text>
                  </Tooltip>
                </DataTable.Td>
                <DataTable.Td>
                  <Text size="sm">{v.fieldCount}</Text>
                </DataTable.Td>
                <DataTable.Td>
                  <Text size="sm">{formatDateTime(v.createdAt)}</Text>
                </DataTable.Td>
                <DataTable.Td>
                  {isDeleted ? (
                    <Badge color="gray">Deleted</Badge>
                  ) : v.isActive ? (
                    <Badge
                      color="green"
                      leftSection={<IconStarFilled size={10} />}
                    >
                      Active
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="light">
                      Inactive
                    </Badge>
                  )}
                </DataTable.Td>
                <DataTable.Td>
                  <Group gap="xs" justify="flex-end" wrap="nowrap">
                    <Tooltip label="View training data">
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        onClick={() => setDrawerVersion(v)}
                      >
                        <IconHistory size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip
                      label={blockActivateReason ?? "Set active"}
                      disabled={!isDeleted && !v.isActive}
                    >
                      <ActionIcon
                        variant="subtle"
                        color={v.isActive ? "green" : "gray"}
                        disabled={
                          v.isActive ||
                          isDeleted ||
                          isActivating ||
                          trainingInProgress
                        }
                        onClick={() => handleActivate(v)}
                      >
                        <IconStar size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip
                      label={
                        v.isActive
                          ? "Activate another version first"
                          : isDeleted
                            ? "Already deleted"
                            : "Delete version"
                      }
                    >
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        disabled={v.isActive || isDeleted || isDeleting}
                        onClick={() => handleDelete(v)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </DataTable.Td>
              </DataTable.Tr>
            );
          })}
        </DataTable.Tbody>
      </DataTable>

      {versions.some((v) => v.isActive) ? null : (
        <Alert
          color="orange"
          variant="light"
          icon={<IconAlertCircle size={16} />}
        >
          No version is currently active. OCR and benchmarks may fail until you
          activate one.
        </Alert>
      )}

      <TrainedVersionSnapshotDrawer
        templateModelId={templateModelId}
        versionId={drawerVersion?.id ?? null}
        versionNumber={drawerVersion?.version ?? null}
        opened={drawerVersion !== null}
        onClose={() => setDrawerVersion(null)}
      />
    </Stack>
  );
};
