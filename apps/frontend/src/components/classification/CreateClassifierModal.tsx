import { useClassifier } from "@/data/hooks/useClassifier";
import { ClassifierSource } from "@/shared/types/classifier";
import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";

interface CreateClassifierModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  afterSubmit?: () => void;
  // onCreate: (values: { name: string; description: string; group: string }) => void;
  groupOptions: { id: string; name: string }[];
}

const CreateModelModal = (props: CreateClassifierModalProps) => {
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

export default CreateModelModal;