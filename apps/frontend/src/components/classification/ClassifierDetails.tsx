import { useState } from "react";
import { useClassifier } from "@/data/hooks/useClassifier";
import { ClassifierModel } from "@/shared/types/classifier";
import { Group, Paper, Stack, Text, Button, Textarea, Notification } from "@mantine/core";
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
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSave = (values: typeof form.values) => {
    setShowSuccess(false);
    setErrorMsg(null);
    updateClassifier.mutate(
      {
        name: classifierModel.name,
        description: values.description,
        group_id: classifierModel.group_id,
        source: classifierModel.source,
      },
      {
        onSuccess: () => {
          setShowSuccess(true);
        },
        onError: (error: any) => {
          setErrorMsg(error?.message || "Failed to update classifier");
        },
      }
    );
  };

  return (
    <Stack gap="md">
      <Paper shadow="sm" radius="md" p="lg" withBorder>

        <form onSubmit={form.onSubmit((values) => {
          onSave(values);
        })}>
          <Group justify="space-between">
            <h2>Classifier Details</h2>
            <Button type="submit" variant="outline" size="xs">Update</Button>
          </Group>
          {showSuccess && (
            <Notification color="green" onClose={() => setShowSuccess(false)}>
              Classifier updated successfully.
            </Notification>
          )}
          {errorMsg && (
            <Notification color="red" onClose={() => setErrorMsg(null)}>
              {errorMsg}
            </Notification>
          )}
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
            placeholder="Enter description"
            mt="xs"
            {...form.getInputProps("description")}
          />
        </form>
      </Paper>
    </Stack>
  );
};

export default ClassifierDetails;