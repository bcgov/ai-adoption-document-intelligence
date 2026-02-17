import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";

interface CreateClassifierModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  // onClose: () => void;
  // onCreate: (values: { name: string; description: string; group: string }) => void;
  groupOptions: { value: string; label: string }[];
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

  const onCreate = (values: typeof form.values) => {
    // Implement model creation logic here
    console.log("Creating model with values:", values);
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
          onCreate(form.values);
          form.reset();
          setIsOpen(false);
        })}>
          <Stack gap="md">
            <Select
              label="Group"
              placeholder="Select a group"
              data={groupOptions}
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