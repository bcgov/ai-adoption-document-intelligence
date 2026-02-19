import ClassificationFiles from "@/components/classification/ClassificationFiles";
import ClassifierDetails from "@/components/classification/ClassifierDetails";
import { CreateClassifierModal } from "@/components/classification/ClassifierModals";
import { useClassifier } from "@/data/hooks/useClassifier";
import { Group, Stack, Title, Text, Paper, Select, Button, } from "@mantine/core";
import { useState } from "react";

const ClassifierPage = () => {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { getClassifiers } = useClassifier();
  console.log(getClassifiers.data);

  // TODO: replace with real data
  const groupOptions = [
    { id: "00000000-0000-0000-0000-000000000000", name: "Group 1" },
    { id: "00000000-0000-0000-0000-000000000001", name: "Group 2" },
  ];

  const groupMap = groupOptions.reduce((acc, group) => {
    acc[group.id] = group.name;
    return acc;
  }, {} as Record<string, string>);

  const ModelSelect = () => {
    return <><Paper shadow="sm" radius="md" p="lg" withBorder>
      <Stack gap="md" mt="md">
        <Group justify="space-between">
          <Title order={3}>Select a model</Title>
          <Button variant="outline" size="xs" onClick={() => {
            // Open modal for classifier creation
            setIsCreateModalOpen(true);
          }}>Create new model</Button>
        </Group>
        <Select
          placeholder="Choose a model"
          value={selectedModel}
          data={(getClassifiers.data || [])
            .filter(model => model && model.name && model.group_id)
            .map((model) => ({
              value: `${model.name}::${model.group_id}`,
              label: `${model.name} (${groupMap[model.group_id]})`
            }))}
          searchable
          clearable
          onChange={(value) => {
            setSelectedModel(value)
          }}
        />
      </Stack>
    </Paper>
      {!selectedModel && (<Text c="dimmed" size="sm">
        No model selected. Please select a model or create a new model.
      </Text>)}</>;
  }

  const selectedModelDetails = selectedModel && getClassifiers.data
    ? getClassifiers.data.find(m => `${m.name}::${m.group_id}` === selectedModel)
    : null;
  if (selectedModel && !selectedModelDetails) {
    return <Text c="red">Selected model not found</Text>;
  }

  return <Stack gap={"lg"}>
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
        <ClassifierDetails key={selectedModel} classifierModel={selectedModelDetails} />
        <ClassificationFiles classifierModel={selectedModelDetails} afterTrainingRequested={async () => {
          await getClassifiers.refetch();
        }}/>
      </>
    )}
    <CreateClassifierModal isOpen={isCreateModalOpen} setIsOpen={setIsCreateModalOpen} groupOptions={groupOptions} afterSubmit={async () => {
      await getClassifiers.refetch();
    }} />
  </Stack>;
}
export default ClassifierPage;