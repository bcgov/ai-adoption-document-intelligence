import { useClassifier } from "@/data/hooks/useClassifier";
import { ClassifierModel } from "@/shared/types/classifier";
import { Group, Paper, Stack, Text, Button, Textarea } from "@mantine/core";
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

  const { updateClassifier } = useClassifier();

  const onSave = (values: typeof form.values) => {
    updateClassifier.mutate({
      name: classifierModel.name,
      description: values.description,
      group_id: classifierModel.group_id,
      source: classifierModel.source,
    });
  }

  return (
    <Stack gap="md">
      <Paper shadow="sm" radius="md" p="lg" withBorder>
        <h2>Classifier Details</h2>
        <form onSubmit={form.onSubmit((values) => {
          onSave(values);
        })}>
          <Text mt="md">
            <b>Name:</b> {classifierModel.name}
          </Text>
          <Text mt="md">
            <b>Group Ownership:</b> {classifierModel.group ? classifierModel.group.name : `ID: ${classifierModel.group_id}`}
          </Text>
          <Text mt="md">
            <b>Status:</b> {classifierModel.status}
          </Text>

          <Text mt="md">
            <b>Description:</b>
          </Text>
          <Textarea
            component="textarea"
            minRows={3}
            // label={"Description"}
            placeholder="Enter description"
            mt="xs"
            {...form.getInputProps("description")}
          />
          <Group justify="flex-end" mt="md">
            <Button type="submit">Update</Button>
          </Group>
        </form>
      </Paper>
    </Stack>
  );
};

export default ClassifierDetails;