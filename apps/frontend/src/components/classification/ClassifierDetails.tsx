import {
  Button,
  Group,
  Notification,
  Paper,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { DeleteClassifierConfirmationModal } from "@/components/classification/ClassifierModals";
import { useClassifier } from "@/data/hooks/useClassifier";
import { useMyGroups } from "@/data/hooks/useGroups";
import { ClassifierModel } from "@/shared/types/classifier";

interface ClassifierDetailsProps {
  classifierModel: ClassifierModel;
  onDeleted?: () => void;
}

const ClassifierDetails = ({
  classifierModel,
  onDeleted,
}: ClassifierDetailsProps) => {
  const form = useForm({
    initialValues: {
      name: classifierModel.name || "",
      description: classifierModel.description || "",
    },
    validate: {
      name: (value) => (value.trim() === "" ? "Name is required" : null),
    },
  });

  const { updateClassifier } = useClassifier();
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const { user, isSystemAdmin } = useAuth();
  const { data: myGroups } = useMyGroups(user?.sub ?? "");
  const isGroupAdmin =
    myGroups?.some(
      (g) => g.id === classifierModel.group_id && g.role === "ADMIN",
    ) ?? false;
  const canDelete = isSystemAdmin || isGroupAdmin;

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
        onError: (error: unknown) => {
          if (error instanceof Error) {
            setErrorMsg(error.message);
          } else {
            setErrorMsg("Failed to update classifier");
          }
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Paper shadow="sm" radius="md" p="lg" withBorder>
        <form
          onSubmit={form.onSubmit((values) => {
            onSave(values);
          })}
        >
          <Group justify="space-between">
            <h2>Classifier Details</h2>
            <Group gap="xs">
              {canDelete && (
                <Button
                  variant="outline"
                  color="red"
                  size="xs"
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete
                </Button>
              )}
              <Button type="submit" variant="outline" size="xs">
                Update
              </Button>
            </Group>
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
            <b>Group Ownership:</b>{" "}
            {classifierModel.group
              ? classifierModel.group.name
              : `ID: ${classifierModel.group_id}`}
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
      <DeleteClassifierConfirmationModal
        isOpen={deleteModalOpen}
        setIsOpen={setDeleteModalOpen}
        classifierName={classifierModel.name}
        groupId={classifierModel.group_id}
        onDeleted={() => {
          setDeleteModalOpen(false);
          onDeleted?.();
        }}
      />
    </Stack>
  );
};

export default ClassifierDetails;
