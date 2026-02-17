import CreateModelModal from "@/components/classification/CreateClassifierModal";
import { Group, Stack, Title, Text, Paper, Select, Button,} from "@mantine/core";
import { useState } from "react";

enum ClassifierStatus {
  PRETRAINING = "PRETRAINING",
  FAILED = "FAILED",
  TRAINING = "TRAINING",
  READY = "READY",
}

enum ClassifierSource {
  AZURE = "AZURE",
}

const sampleModels = [
  { id: "model-1", name: "Model 1", status: ClassifierStatus.READY, source: ClassifierSource.AZURE },
  { id: "model-2", name: "Model 2", status: ClassifierStatus.TRAINING, source: ClassifierSource.AZURE },
  { id: "model-3", name: "Model 3", status: ClassifierStatus.PRETRAINING, source: ClassifierSource.AZURE },
  { id: "model-4", name: "Model 4", status: ClassifierStatus.PRETRAINING, source: ClassifierSource.AZURE },
];

const ClassifierPage = () => {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [models, setModels] = useState(sampleModels);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // TODO: replace with real data
  const groupOptions = [
    { value: "group-1", label: "Group 1" },
    { value: "group-2", label: "Group 2" },
    { value: "group-3", label: "Group 3" },
  ];

  const ModelSelect = () => {
    return <Paper shadow="sm" radius="md" p="lg" withBorder>
      {!selectedModel && (<Text c="dimmed" size="sm">
        No model selected. Please select a model to classify documents or create a new model.
      </Text>)}
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
          data={models.map(model => ({ value: model.id, label: model.name }))}
          searchable
          clearable
          onChange={(value) => {
            setSelectedModel(value)
          }}
        />
      </Stack>
    </Paper>;
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
    <CreateModelModal isOpen={isCreateModalOpen} setIsOpen={setIsCreateModalOpen}  groupOptions={groupOptions} />
  </Stack>;
}
export default ClassifierPage;