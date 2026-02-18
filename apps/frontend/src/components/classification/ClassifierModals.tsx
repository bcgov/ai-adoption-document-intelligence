import { Button, Group, Modal, Stack, Text, TextInput, FileInput, Select, Textarea } from "@mantine/core";
import { useEffect } from "react";
import { useForm } from "@mantine/form";
import { useClassifier } from "@/data/hooks/useClassifier";
import { ClassifierSource } from "@/shared/types/classifier";

interface DeleteClassifierModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onDelete: () => void;
  loading?: boolean;
  label?: string;
}

export const DeleteClassifierModal = ({ isOpen, setIsOpen, onDelete, loading, label }: DeleteClassifierModalProps) => (
  <Modal
    opened={isOpen}
    onClose={() => setIsOpen(false)}
    title="Delete Classifier Files"
    centered
  >
    <Stack gap="md">
      <Text>Are you sure you want to delete{label ? ` files for "${label}"` : " these files"}? This action cannot be undone.</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
        <Button color="red" onClick={onDelete} loading={loading}>Delete</Button>
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
      label: (value) => value.trim() === "" ? "Label is required" : null,
      files: (value) => !value || value.length === 0 ? "At least one file is required" : null,
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
            multiple
            required
            onChange={files => {
              // FileInput returns File[] | null, but our upload expects FileList | null
              if (!files) {
                form.setFieldValue("files", null);
              } else {
                // Convert File[] to FileList using DataTransfer
                const dt = new DataTransfer();
                files.forEach(file => dt.items.add(file));
                form.setFieldValue("files", dt.files);
              }
            }}
            disabled={loading}
            error={form.errors.files}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" loading={loading} disabled={!form.isValid() || !form.values.files}>Upload</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

interface CreateClassifierModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  afterSubmit?: () => void;
  groupOptions: { id: string; name: string }[];
}

export const CreateClassifierModal = (props: CreateClassifierModalProps) => {
  const { isOpen, setIsOpen, groupOptions } = props;
  const form = useForm({
    initialValues: {
      name: "",
      description: "",
      group: "",
    },
    validate: {
      name: (value) => value.trim() === "" ? "Classifier name is required" : null,
      group: (value) => value === "" ? "Group is required" : null,
    },
  });
  const { createClassifier } = useClassifier();

  const onCreate = async (values: typeof form.values) => {
    console.log("Creating classifier with values", values);
    await createClassifier.mutateAsync({
      name: values.name,
      description: values.description,
      group_id: values.group,
      source: ClassifierSource.AZURE,
    });
  }

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        setIsOpen(false);
      }}
      title="Create new classifier"
    >
      <form onSubmit={form.onSubmit(() => {
        try {
          onCreate(form.values);
          form.reset();
          setIsOpen(false);
          props.afterSubmit?.();
        } catch (error) {
          console.error("Failed to create classifier", error);
        }
      })}>
        <Stack gap="md">
          <Select
            label="Group"
            placeholder="Select a group"
            data={groupOptions.map(group => ({ value: group.id, label: group.name }))}
            {...form.getInputProps("group")}
            required
          />
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
            <Button type="submit" disabled={!form.isValid()}>Create</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}