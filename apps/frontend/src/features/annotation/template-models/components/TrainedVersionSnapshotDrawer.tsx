import { IconAlertCircle } from "@tabler/icons-react";
import { FC } from "react";
import {
  Accordion,
  Alert,
  Badge,
  DataTable,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from "../../../../ui";
import { useTrainedVersionSnapshot } from "../hooks/useTrainedVersions";

interface TrainedVersionSnapshotDrawerProps {
  templateModelId: string;
  versionId: string | null;
  versionNumber: number | null;
  opened: boolean;
  onClose: () => void;
}

export const TrainedVersionSnapshotDrawer: FC<
  TrainedVersionSnapshotDrawerProps
> = ({ templateModelId, versionId, versionNumber, opened, onClose }) => {
  const { data, isLoading, error } = useTrainedVersionSnapshot(
    templateModelId,
    opened ? versionId : null,
  );

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>Training data — v{versionNumber ?? "?"}</Text>}
      position="right"
      size="lg"
    >
      {isLoading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading snapshot…
          </Text>
        </Group>
      ) : error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          Failed to load snapshot.
        </Alert>
      ) : !data || data.documents.length === 0 ? (
        <Alert color="gray" variant="light">
          This version has no recorded training-data snapshot. Versions trained
          before snapshotting was introduced will not show document-level
          history.
        </Alert>
      ) : (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {data.documents.length}{" "}
              {data.documents.length === 1 ? "document" : "documents"}
            </Text>
          </Group>
          <ScrollArea h="calc(100vh - 140px)" type="auto">
            <Accordion multiple variant="separated" chevronPosition="left">
              {data.documents.map((doc) => (
                <Accordion.Item
                  key={doc.labelingDocumentId}
                  value={doc.labelingDocumentId}
                >
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap" pr="md">
                      <Text fw={500} size="sm" lineClamp={1}>
                        {doc.originalFilename}
                      </Text>
                      <Badge size="sm" variant="light">
                        {doc.labels.length}{" "}
                        {doc.labels.length === 1 ? "label" : "labels"}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {doc.labels.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        No labels recorded for this document.
                      </Text>
                    ) : (
                      <DataTable withRowBorders={false} verticalSpacing={4}>
                        <DataTable.Thead>
                          <DataTable.Tr>
                            <DataTable.Th>Field</DataTable.Th>
                            <DataTable.Th>Value</DataTable.Th>
                            <DataTable.Th style={{ width: 60 }}>
                              Page
                            </DataTable.Th>
                          </DataTable.Tr>
                        </DataTable.Thead>
                        <DataTable.Tbody>
                          {doc.labels.map((label, idx) => (
                            <DataTable.Tr key={`${label.fieldKey}-${idx}`}>
                              <DataTable.Td>
                                <Text size="xs" fw={500}>
                                  {label.fieldKey}
                                </Text>
                              </DataTable.Td>
                              <DataTable.Td>
                                <Text size="xs" lineClamp={2}>
                                  {label.value ?? "—"}
                                </Text>
                              </DataTable.Td>
                              <DataTable.Td>
                                <Text size="xs" c="dimmed">
                                  {label.pageNumber}
                                </Text>
                              </DataTable.Td>
                            </DataTable.Tr>
                          ))}
                        </DataTable.Tbody>
                      </DataTable>
                    )}
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </ScrollArea>
        </Stack>
      )}
    </Drawer>
  );
};
