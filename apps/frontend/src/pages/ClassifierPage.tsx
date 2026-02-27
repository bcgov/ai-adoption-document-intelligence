import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useState } from "react";
import { useGroup } from "@/auth/GroupContext";
import ClassificationFiles from "@/components/classification/ClassificationFiles";
import ClassifierAccess from "@/components/classification/ClassifierAccess";
import ClassifierDetails from "@/components/classification/ClassifierDetails";
import { CreateClassifierModal } from "@/components/classification/ClassifierModals";
import { useClassifier } from "@/data/hooks/useClassifier";
import { ClassifierStatus } from "@/shared/types/classifier";

const ClassifierPage = () => {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { getClassifiers } = useClassifier();
  const { activeGroup } = useGroup();

  const ModelSelect = () => {
    return (
      <>
        <Paper shadow="sm" radius="md" p="lg" withBorder>
          <Stack gap="md" mt="md">
            <Group justify="space-between">
              <Title order={3}>Select a model</Title>
              <Tooltip
                label="A group must be selected to create a model"
                disabled={!!activeGroup}
              >
                <span>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={!activeGroup}
                    onClick={() => {
                      setIsCreateModalOpen(true);
                    }}
                  >
                    Create new model
                  </Button>
                </span>
              </Tooltip>
            </Group>
            <Select
              placeholder="Choose a model"
              value={selectedModel}
              data={(getClassifiers.data || [])
                .filter((model) => model && model.name && model.group_id)
                .map((model) => ({
                  value: `${model.name}::${model.group_id}`,
                  label: model.name,
                }))}
              searchable
              clearable
              onChange={(value) => {
                setSelectedModel(value);
              }}
            />
          </Stack>
        </Paper>
        {!selectedModel && (
          <Text c="dimmed" size="sm">
            No model selected. Please select a model or create a new model.
          </Text>
        )}
      </>
    );
  };

  const selectedModelDetails =
    selectedModel && getClassifiers.data
      ? getClassifiers.data.find(
          (m) => `${m.name}::${m.group_id}` === selectedModel,
        )
      : null;
  if (selectedModel && !selectedModelDetails) {
    return <Text c="red">Selected model not found</Text>;
  }

  return (
    <Stack gap={"lg"} mb="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Classify</Title>
          <Text c="dimmed" size="sm">
            Build document classifiers and classify documents
          </Text>
        </Stack>
      </Group>
      <ModelSelect />
      {selectedModel && selectedModelDetails && (
        <>
          <ClassifierDetails
            key={selectedModel}
            classifierModel={selectedModelDetails}
          />
          <ClassificationFiles
            classifierModel={selectedModelDetails}
            afterTrainingRequested={async () => {
              await getClassifiers.refetch();
            }}
          />
          {selectedModelDetails.status === ClassifierStatus.READY && (
            <ClassifierAccess model={selectedModelDetails} />
          )}
        </>
      )}
      <CreateClassifierModal
        isOpen={isCreateModalOpen}
        setIsOpen={setIsCreateModalOpen}
        afterSubmit={async () => {
          await getClassifiers.refetch();
        }}
      />
    </Stack>
  );
};
export default ClassifierPage;
