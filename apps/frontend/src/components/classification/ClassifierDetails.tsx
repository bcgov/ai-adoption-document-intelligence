import { ClassifierStatus, ClassifierSource, ClassifierModel } from "@/shared/types/classifier";
import { Group, Paper, Stack, TextInput, Text, Button } from "@mantine/core";
import { useForm } from "@mantine/form";

interface ClassifierDetailsProps {
  classifierModel: ClassifierModel;
}

const ClassifierDetails = ({ classifierModel }: ClassifierDetailsProps) => {
  const form = useForm({
    initialValues: {
      name: classifierModel.name || "",
      description: classifierModel.description || "",
    },
    validate: {
      name: (value) => value.trim() === "" ? "Name is required" : null,
    },
  });

  return (
    <Stack gap="md">
      <Paper shadow="sm" radius="md" p="lg" withBorder>
        <h2>Classifier Details</h2>
        <form onSubmit={form.onSubmit((values) => {
          // handle save
        })}>
          <TextInput
            label="Classifier Name"
            placeholder="Enter classifier name"
            {...form.getInputProps("name")}
            required
          />
          <TextInput
            label="Description"
            placeholder="Enter description"
            {...form.getInputProps("description")}
          />
          <Text mt="md">
            <b>Status:</b> {classifierModel.status}
          </Text>
          {classifierModel.group && (
            <Text mt="md">
              <b>Group Ownership:</b> {classifierModel.group.name}
            </Text>
          )}
          <Group justify="flex-end" mt="md">
            <Button type="submit">Save</Button>
          </Group>
        </form>
      </Paper>
    </Stack>
  );
};

export default ClassifierDetails;