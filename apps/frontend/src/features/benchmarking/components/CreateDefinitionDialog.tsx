import {
  Button,
  Group,
  Modal,
  NumberInput,
  Radio,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { useAllDatasetVersions } from "../hooks/useDatasetVersions";
import { useWorkflows } from "../hooks/useWorkflows";

interface CreateDefinitionDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (data: CreateDefinitionFormData) => void;
  isCreating: boolean;
}

export interface CreateDefinitionFormData {
  name: string;
  datasetVersionId: string;
  splitId: string;
  workflowId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  artifactPolicy: Record<string, unknown>;
}

interface Split {
  id: string;
  name: string;
  type: string;
}

export function CreateDefinitionDialog({
  opened,
  onClose,
  onCreate,
  isCreating,
}: CreateDefinitionDialogProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const [splitId, setSplitId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [evaluatorType, setEvaluatorType] = useState("schema-aware");
  const [evaluatorConfigJson, setEvaluatorConfigJson] = useState("");
  const [evaluatorConfigError, setEvaluatorConfigError] = useState("");
  const [maxParallelDocuments, setMaxParallelDocuments] = useState(10);
  const [perDocumentTimeout, setPerDocumentTimeout] = useState(300000);
  const [useProductionQueue, setUseProductionQueue] = useState(false);
  const [artifactPolicyMode, setArtifactPolicyMode] = useState("failures_only");
  const [sampleRate, setSampleRate] = useState(0.1);

  const { versions, isLoading: isLoadingVersions } = useAllDatasetVersions();
  const { workflows, isLoading: isLoadingWorkflows } = useWorkflows();

  const [splits, setSplits] = useState<Split[]>([]);

  const handleVersionChange = (versionId: string | null) => {
    setDatasetVersionId(versionId || "");
    setSplitId("");

    if (versionId) {
      const version = versions.find((v) => v.id === versionId);
      if (version?.splits) {
        setSplits(version.splits);
      } else {
        setSplits([]);
      }
    } else {
      setSplits([]);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError("Name is required");
      return;
    }

    let evaluatorConfig: Record<string, unknown> = {};
    if (evaluatorConfigJson.trim()) {
      try {
        evaluatorConfig = JSON.parse(evaluatorConfigJson);
      } catch {
        setEvaluatorConfigError("Invalid JSON");
        return;
      }
    }

    const runtimeSettings: Record<string, unknown> = {
      maxParallelDocuments,
      perDocumentTimeout,
      useProductionQueue,
    };

    const artifactPolicy: Record<string, unknown> = {
      mode: artifactPolicyMode,
    };
    if (artifactPolicyMode === "sampled") {
      artifactPolicy.sampleRate = sampleRate;
    }

    onCreate({
      name,
      datasetVersionId,
      splitId,
      workflowId,
      evaluatorType,
      evaluatorConfig,
      runtimeSettings,
      artifactPolicy,
    });
  };

  const handleClose = () => {
    setName("");
    setNameError("");
    setDatasetVersionId("");
    setSplitId("");
    setWorkflowId("");
    setEvaluatorType("schema-aware");
    setEvaluatorConfigJson("");
    setEvaluatorConfigError("");
    setMaxParallelDocuments(10);
    setPerDocumentTimeout(300000);
    setUseProductionQueue(false);
    setArtifactPolicyMode("failures_only");
    setSampleRate(0.1);
    setSplits([]);
    onClose();
  };

  const versionOptions = versions.map((v) => ({
    value: v.id,
    label: `${v.version} (${v.documentCount} documents)${v.status === "draft" ? " [DRAFT]" : ""}`,
  }));

  const splitOptions = splits.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.type})`,
  }));

  const workflowOptions = workflows.map((w) => ({
    value: w.id,
    label: `${w.name} (v${w.version})`,
  }));

  const evaluatorOptions = [
    { value: "schema-aware", label: "Schema-Aware" },
    { value: "black-box", label: "Black-Box" },
  ];

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create Benchmark Definition"
      size="lg"
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="Enter definition name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError("");
          }}
          error={nameError}
          required
          data-testid="definition-name-input"
        />

        <Select
          label="Dataset Version"
          placeholder="Select dataset version"
          data={versionOptions}
          value={datasetVersionId}
          onChange={handleVersionChange}
          disabled={isLoadingVersions}
          searchable
          required
          data-testid="dataset-version-select"
        />

        <Select
          label="Split"
          placeholder="Select split"
          data={splitOptions}
          value={splitId}
          onChange={(value) => setSplitId(value || "")}
          disabled={!datasetVersionId || splits.length === 0}
          required
          data-testid="split-select"
        />

        <Select
          label="Workflow"
          placeholder="Select workflow"
          data={workflowOptions}
          value={workflowId}
          onChange={(value) => setWorkflowId(value || "")}
          disabled={isLoadingWorkflows}
          searchable
          required
          data-testid="workflow-select"
        />

        <Select
          label="Evaluator Type"
          data={evaluatorOptions}
          value={evaluatorType}
          onChange={(value) => setEvaluatorType(value || "schema-aware")}
          required
          data-testid="evaluator-type-select"
        />

        <Textarea
          label="Evaluator Config (JSON)"
          placeholder='{"key": "value"}'
          value={evaluatorConfigJson}
          onChange={(e) => {
            setEvaluatorConfigJson(e.target.value);
            setEvaluatorConfigError("");
          }}
          error={evaluatorConfigError}
          minRows={3}
          data-testid="evaluator-config-textarea"
        />

        <Text size="sm" fw={500}>
          Runtime Settings
        </Text>

        <NumberInput
          label="Max Parallel Documents"
          value={maxParallelDocuments}
          onChange={(value) =>
            setMaxParallelDocuments(typeof value === "number" ? value : 10)
          }
          min={1}
          max={100}
          data-testid="max-parallel-documents-input"
        />

        <NumberInput
          label="Per Document Timeout (ms)"
          value={perDocumentTimeout}
          onChange={(value) =>
            setPerDocumentTimeout(typeof value === "number" ? value : 300000)
          }
          min={1000}
          step={1000}
          data-testid="per-document-timeout-input"
        />

        <Radio.Group
          label="Use Production Queue"
          value={useProductionQueue ? "true" : "false"}
          onChange={(value) => setUseProductionQueue(value === "true")}
          data-testid="production-queue-radio"
        >
          <Group mt="xs">
            <Radio value="false" label="No (Benchmark Queue)" data-testid="production-queue-no" />
            <Radio value="true" label="Yes (Production Queue)" data-testid="production-queue-yes" />
          </Group>
        </Radio.Group>

        <Radio.Group
          label="Artifact Policy"
          value={artifactPolicyMode}
          onChange={setArtifactPolicyMode}
          data-testid="artifact-policy-radio"
        >
          <Stack mt="xs" gap="xs">
            <Radio value="full" label="Full (all outputs)" data-testid="artifact-policy-full" />
            <Radio value="failures_only" label="Failures Only" data-testid="artifact-policy-failures" />
            <Radio value="sampled" label="Sampled" data-testid="artifact-policy-sampled" />
          </Stack>
        </Radio.Group>

        {artifactPolicyMode === "sampled" && (
          <NumberInput
            label="Sample Rate"
            value={sampleRate}
            onChange={(value) =>
              setSampleRate(typeof value === "number" ? value : 0.1)
            }
            min={0}
            max={1}
            step={0.1}
          />
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose} data-testid="cancel-definition-btn">
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isCreating} data-testid="submit-definition-btn">
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
