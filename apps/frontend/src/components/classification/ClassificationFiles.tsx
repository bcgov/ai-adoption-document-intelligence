import { Button, Group, Paper, Stack } from "@mantine/core";
import ClassificationFileCards from "./ClassificationFileCards";
import { useClassifier } from "@/data/hooks/useClassifier";
import { DeleteClassifierModal, UploadClassifierFilesModal } from "./ClassifierModals";
import { useState } from "react";

interface ClassificationFilesProps {
  groupId: string;
  name: string;
}

const ClassificationFiles = (props: ClassificationFilesProps) => {
  const { groupId, name } = props;
  const { getClassifierDocuments, deleteClassifierDocuments, uploadClassifierDocuments } = useClassifier();
  const docsQuery = getClassifierDocuments(groupId, name);

  // Transform API result into label/fileCount objects
  const files = (() => {
    const data = docsQuery.data || [];
    const labelCounts: Record<string, number> = {};
    data.forEach(item => {
      // If item ends with '/', it's a directory label
      if (item.endsWith('/')) {
        labelCounts[item.replace(/\/$/, '')] = 0;
      } else {
        // Extract directory name
        const match = item.match(/^([^/]+)\//);
        if (match) {
          const label = match[1];
          labelCounts[label] = (labelCounts[label] || 0) + 1;
        }
      }
    });
    return Object.entries(labelCounts).map(([label, fileCount]) => ({ label, fileCount }));
  })();

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; label: string | null }>({ open: false, label: null });
  const [uploadModal, setUploadModal] = useState<{ open: boolean; label: string | null }>({ open: false, label: null });

  return (
    <Stack>
      <Paper shadow="xs" radius="md" p="sm" withBorder>
        <Group justify="space-between" align="center" mb="md">
          <h2>Classification Files</h2>
          <Button variant="outline" size="xs" onClick={() => setUploadModal({ open: true, label: "" })}>
            Add File Group
          </Button>
        </Group>
        {docsQuery.isLoading && <p>Loading files...</p>}
        {docsQuery.isError && <p style={{ color: 'red' }}>Error loading files</p>}
        <ClassificationFileCards
          fileGroups={files}
          onDelete={label => setDeleteModal({ open: true, label })}
          onUpload={label => setUploadModal({ open: true, label })}
        />
      </Paper>
      <DeleteClassifierModal
        isOpen={deleteModal.open}
        setIsOpen={open => setDeleteModal(d => ({ ...d, open }))}
        label={deleteModal.label || undefined}
        loading={deleteClassifierDocuments.status === 'pending'}
        onDelete={async () => {
          if (deleteModal.label) {
            await deleteClassifierDocuments.mutateAsync({ name, group_id: groupId, folder: deleteModal.label });
            await docsQuery.refetch();
          }
          setDeleteModal({ open: false, label: null });
        }}
      />
      <UploadClassifierFilesModal
        isOpen={uploadModal.open}
        setIsOpen={open => setUploadModal(d => ({ ...d, open }))}
        label={uploadModal.label || ""}
        labelEditable={uploadModal.label === ""}
        loading={uploadClassifierDocuments.status === 'pending'}
        onUpload={async (files, label) => {
          await uploadClassifierDocuments.mutateAsync({ name, group_id: groupId, label: label, files });
          await docsQuery.refetch();
          setUploadModal({ open: false, label: null });
        }}
      />
    </Stack>
  );
}

export default ClassificationFiles;