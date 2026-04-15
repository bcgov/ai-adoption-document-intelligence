import {
  Button,
  Group,
  Notification,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useClassifier } from "@/data/hooks/useClassifier";
import { ClassifierModel } from "@/shared/types/classifier";
import ClassificationFileCards from "./ClassificationFileCards";
import {
  DeleteClassifierModal,
  UploadClassifierFilesModal,
} from "./ClassifierModals";

interface ClassificationFilesProps {
  classifierModel: ClassifierModel;
  afterTrainingRequested?: () => Promise<void>;
}

const ClassificationFiles = (props: ClassificationFilesProps) => {
  const { classifierModel, afterTrainingRequested } = props;
  const { group_id: groupId, name } = classifierModel;
  const {
    getClassifierDocuments,
    deleteClassifierDocuments,
    uploadClassifierDocuments,
    requestTraining,
  } = useClassifier();
  const docsQuery = getClassifierDocuments(groupId, name);

  // Transform API result into label/fileCount objects
  const files = useMemo(() => {
    const data = docsQuery.data || [];
    const labelCounts: Record<string, number> = {};
    data.forEach((item: string) => {
      // If item ends with '/', it's a directory label
      if (item.endsWith("/")) {
        labelCounts[item.replace(/\/$/, "")] = 0;
      } else {
        // Extract directory name
        const match = item.match(/^\/([^/]+)\//);
        if (match) {
          const label = match[1];
          labelCounts[label] = (labelCounts[label] || 0) + 1;
        }
      }
    });
    return Object.entries(labelCounts).map(([label, fileCount]) => ({
      label,
      fileCount,
    }));
  }, [docsQuery.data]);

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    label: string | null;
  }>({ open: false, label: null });
  const [uploadModal, setUploadModal] = useState<{
    open: boolean;
    label: string | null;
  }>({ open: false, label: null });

  // Determine train button label and disabled state
  let trainLabel = "Train";
  if (classifierModel) {
    if (
      classifierModel.status === "TRAINING" ||
      classifierModel.status === "READY"
    ) {
      trainLabel = "Retrain";
    }
  }
  const trainDisabled = files.length < 2;
  const trainTooltip = trainDisabled
    ? "At least 2 label groups are required to train."
    : undefined;

  const [showTrainingNotice, setShowTrainingNotice] = useState(false);

  return (
    <Stack>
      <Paper shadow="xs" radius="md" p="sm" withBorder>
        <Group justify="space-between" align="center" mb="xs">
          <h2>Classification Label Training Groups</h2>
          <Group gap={4}>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setUploadModal({ open: true, label: "" })}
            >
              Add Label Group
            </Button>
            {classifierModel && (
              <Tooltip label={trainTooltip} disabled={!trainDisabled} withArrow>
                <Button
                  variant="filled"
                  size="xs"
                  disabled={trainDisabled}
                  color="blue"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    requestTraining.mutate(
                      { name, group_id: groupId },
                      {
                        onSuccess: async () => {
                          setShowTrainingNotice(true);
                          if (afterTrainingRequested) {
                            await afterTrainingRequested();
                          }
                        },
                      },
                    );
                  }}
                >
                  {trainLabel}
                </Button>
              </Tooltip>
            )}
          </Group>
        </Group>
        {showTrainingNotice && (
          <Notification
            icon={<IconInfoCircle size={18} />}
            color="blue"
            title="Training Started"
            onClose={() => setShowTrainingNotice(false)}
            mt="sm"
          >
            Model training has started. This may take a few minutes. Please
            check back later to see the updated status.
          </Notification>
        )}
        {docsQuery.isLoading && <p>Loading files...</p>}
        {docsQuery.isError && (
          <p style={{ color: "red" }}>Error loading files</p>
        )}
        <Text size="sm" c="dimmed" mb="md">
          {files.length === 0
            ? "No files uploaded yet. Use the 'Add Label Group' button to create a new group and upload files."
            : "Each label represents a group of files used for training. You can add files to an existing label or delete an entire label group."}
        </Text>
        <ClassificationFileCards
          fileGroups={files}
          onDelete={(label) => setDeleteModal({ open: true, label })}
          onUpload={(label) => setUploadModal({ open: true, label })}
        />
      </Paper>
      <DeleteClassifierModal
        isOpen={deleteModal.open}
        setIsOpen={(open) => setDeleteModal((d) => ({ ...d, open }))}
        label={deleteModal.label || undefined}
        loading={deleteClassifierDocuments.status === "pending"}
        onDelete={async () => {
          if (deleteModal.label) {
            await deleteClassifierDocuments.mutateAsync({
              name,
              group_id: groupId,
              folder: deleteModal.label,
            });
            await docsQuery.refetch();
          }
          setDeleteModal({ open: false, label: null });
        }}
      />
      <UploadClassifierFilesModal
        isOpen={uploadModal.open}
        setIsOpen={(open) => setUploadModal((d) => ({ ...d, open }))}
        label={uploadModal.label || ""}
        labelEditable={uploadModal.label === ""}
        loading={uploadClassifierDocuments.status === "pending"}
        onUpload={async (files, label) => {
          await uploadClassifierDocuments.mutateAsync({
            name,
            group_id: groupId,
            label: label,
            files,
          });
          await docsQuery.refetch();
          setUploadModal({ open: false, label: null });
        }}
      />
    </Stack>
  );
};

export default ClassificationFiles;
