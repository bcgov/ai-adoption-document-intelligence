import {
  Button,
  FileInput,
  Group,
  List,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useGroup } from "@/auth/GroupContext";
import { ConflictingWorkflow, useClassifier } from "@/data/hooks/useClassifier";
import {
  ClassifierSource,
  RESERVED_CLASSIFIER_LABELS,
} from "@/shared/types/classifier";

interface DeleteClassifierModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onDelete: () => void;
  loading?: boolean;
  label?: string;
}

export const DeleteClassifierModal = ({
  isOpen,
  setIsOpen,
  onDelete,
  loading,
  label,
}: DeleteClassifierModalProps) => (
  <Modal
    opened={isOpen}
    onClose={() => setIsOpen(false)}
    title="Delete Classifier Files"
    centered
  >
    <Stack gap="md">
      <Text>
        Are you sure you want to delete
        {label ? ` files for "${label}"` : " these files"}? This action cannot
        be undone.
      </Text>
      <Group justify="flex-end">
        <Button
          variant="default"
          onClick={() => setIsOpen(false)}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button color="red" onClick={onDelete} loading={loading}>
          Delete
        </Button>
      </Group>
    </Stack>
  </Modal>
);

interface UploadClassifierFilesModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onUpload: (files: FileList, label: string) => void;
  label: string;
  labelEditable?: boolean;
  loading?: boolean;
}

export const UploadClassifierFilesModal = ({
  isOpen,
  setIsOpen,
  onUpload,
  label,
  labelEditable = false,
  loading,
}: UploadClassifierFilesModalProps) => {
  const form = useForm({
    initialValues: {
      label: label,
      files: null as FileList | null,
    },
    validate: {
      label: (value) => {
        if (value.trim() === "") return "Label is required";
        if (
          RESERVED_CLASSIFIER_LABELS.includes(
            value
              .trim()
              .toLowerCase() as (typeof RESERVED_CLASSIFIER_LABELS)[number],
          )
        ) {
          return `"${value}" is a reserved label and cannot be used. Reserved labels: ${RESERVED_CLASSIFIER_LABELS.join(", ")}.`;
        }
        return null;
      },
      files: (value) => {
        if (!value || value.length === 0)
          return "At least one file is required";
        const invalid = Array.from(value).filter(
          (f) => !f.type.startsWith("image/") && f.type !== "application/pdf",
        );
        if (invalid.length > 0) return "Only image files and PDFs are allowed";
        return null;
      },
    },
  });

  useEffect(() => {
    form.setFieldValue("label", label);
  }, [label]);

  const handleSubmit = (values: typeof form.values) => {
    if (values.files) {
      onUpload(values.files, values.label);
      form.reset();
      setIsOpen(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={() => setIsOpen(false)}
      title="Upload Files to Classifier"
      centered
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput
            label="Label"
            {...form.getInputProps("label")}
            disabled={!labelEditable}
            required
          />
          <FileInput
            label="Files"
            placeholder="Select files"
            accept="image/*,application/pdf"
            multiple
            required
            onChange={(files) => {
              // FileInput returns File[] | null, but our upload expects FileList | null
              if (!files) {
                form.setFieldValue("files", null);
              } else {
                // Convert File[] to FileList using DataTransfer
                const dt = new DataTransfer();
                files.forEach((file) => {
                  dt.items.add(file);
                });
                form.setFieldValue("files", dt.files);
              }
            }}
            disabled={loading}
            error={form.errors.files}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setIsOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={!form.isValid() || !form.values.files}
            >
              Upload
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

interface DeleteClassifierConfirmationModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  classifierName: string;
  groupId: string;
  onDeleted: () => void;
}

export const DeleteClassifierConfirmationModal = ({
  isOpen,
  setIsOpen,
  classifierName,
  groupId,
  onDeleted,
}: DeleteClassifierConfirmationModalProps) => {
  const [confirmText, setConfirmText] = useState("");
  const [conflictingWorkflows, setConflictingWorkflows] = useState<
    ConflictingWorkflow[] | null
  >(null);
  const { deleteClassifier } = useClassifier();

  const handleClose = () => {
    setConfirmText("");
    setConflictingWorkflows(null);
    setIsOpen(false);
  };

  const handleDelete = () => {
    setConflictingWorkflows(null);
    deleteClassifier.mutate(
      { name: classifierName, group_id: groupId },
      {
        onSuccess: () => {
          notifications.show({
            title: "Classifier Deleted",
            message: `"${classifierName}" has been permanently deleted.`,
            color: "green",
          });
          handleClose();
          onDeleted();
        },
        onError: (error) => {
          if (error.conflictingWorkflows) {
            setConflictingWorkflows(error.conflictingWorkflows);
          } else {
            notifications.show({
              title: "Error",
              message: error.message,
              color: "red",
            });
          }
        },
      },
    );
  };

  const isConfirmed = confirmText.toLowerCase() === "delete";

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title="Delete Classifier"
      centered
    >
      <Stack gap="md">
        <Text>
          You are about to permanently delete the classifier{" "}
          <strong>{classifierName}</strong>. This action cannot be undone.
        </Text>
        {conflictingWorkflows && conflictingWorkflows.length > 0 && (
          <Stack gap="xs">
            <Text c="red" fw={500}>
              This classifier cannot be deleted because it is referenced by the
              following workflows:
            </Text>
            <List size="sm">
              {conflictingWorkflows.map((wf) => (
                <List.Item key={wf.id}>
                  {wf.name} (ID: {wf.id})
                </List.Item>
              ))}
            </List>
            <Text size="sm" c="dimmed">
              Remove the classifier reference from these workflows before
              deleting.
            </Text>
          </Stack>
        )}
        <TextInput
          label='Type "delete" to confirm'
          placeholder="delete"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          disabled={deleteClassifier.isPending}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={handleClose}
            disabled={deleteClassifier.isPending}
          >
            Cancel
          </Button>
          <Button
            color="red"
            disabled={!isConfirmed}
            loading={deleteClassifier.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface CreateClassifierModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  afterSubmit?: () => void;
}

export const CreateClassifierModal = (props: CreateClassifierModalProps) => {
  const { isOpen, setIsOpen } = props;
  const { activeGroup } = useGroup();
  const form = useForm({
    initialValues: {
      name: "",
      description: "",
    },
    validate: {
      name: (value) =>
        value.trim() === "" ? "Classifier name is required" : null,
    },
  });
  const { createClassifier } = useClassifier();

  const onCreate = async (values: typeof form.values) => {
    if (!activeGroup) {
      throw new Error("No active group selected");
    }
    await createClassifier.mutateAsync({
      name: values.name,
      description: values.description,
      group_id: activeGroup.id,
      source: ClassifierSource.AZURE,
    });
  };

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        setIsOpen(false);
      }}
      title="Create new classifier"
    >
      <form
        onSubmit={form.onSubmit(async () => {
          try {
            await onCreate(form.values);
            form.reset();
            setIsOpen(false);
            props.afterSubmit?.();
          } catch (error) {
            notifications.show({
              title: "Error",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to create classifier",
              color: "red",
            });
          }
        })}
      >
        <Stack gap="md">
          <TextInput
            label="Classifier Name"
            placeholder="Enter classifier name"
            {...form.getInputProps("name")}
            required
          />
          <Textarea
            label="Description (optional)"
            placeholder="Enter description"
            minRows={2}
            {...form.getInputProps("description")}
          />
          <Group justify="flex-end">
            <Button type="submit" disabled={!form.isValid()}>
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};
