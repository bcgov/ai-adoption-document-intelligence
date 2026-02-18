import { Button, Group, Modal, Stack, Text, TextInput, FileInput } from "@mantine/core";
import React, { useEffect } from "react";
import { useForm } from "@mantine/form";

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
