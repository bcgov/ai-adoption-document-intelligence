import {
  Button,
  Code,
  Group,
  Modal,
  NumberInput,
  Radio,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useAllDatasetVersions } from "../hooks/useDatasetVersions";
import { useWorkflows } from "../hooks/useWorkflows";

export interface DefinitionFormInitialValues {
  name: string;
  datasetVersionId: string;
  splitId?: string;
  workflowId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  artifactPolicy: Record<string, unknown>;
}

interface CreateDefinitionDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (data: CreateDefinitionFormData) => void;
  isCreating: boolean;
  mode?: "create" | "edit";
  initialValues?: DefinitionFormInitialValues;
}

export interface CreateDefinitionFormData {
  name: string;
  datasetVersionId: string;
  splitId?: string;
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
  mode = "create",
  initialValues,
}: CreateDefinitionDialogProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const [datasetVersionError, setDatasetVersionError] = useState("");
  const [splitId, setSplitId] = useState("");
  const [splitError, setSplitError] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [evaluatorType, setEvaluatorType] = useState("schema-aware");
  const [evaluatorConfigJson, setEvaluatorConfigJson] = useState("");
  const [evaluatorConfigError, setEvaluatorConfigError] = useState("");
  const [maxParallelDocuments, setMaxParallelDocuments] = useState(10);
  const [perDocumentTimeout, setPerDocumentTimeout] = useState(300000);
  const [useProductionQueue, setUseProductionQueue] = useState(false);
  const [artifactPolicyMode, setArtifactPolicyMode] = useState("failures_only");
  const [sampleRate, setSampleRate] = useState(0.1);
  const [initialized, setInitialized] = useState(false);

  const { versions, isLoading: isLoadingVersions, refetch: refetchVersions } = useAllDatasetVersions();
  const { workflows, isLoading: isLoadingWorkflows } = useWorkflows();

  useEffect(() => {
    if (opened) {
      refetchVersions();
    }
    if (!opened) {
      setInitialized(false);
    }
  }, [opened, refetchVersions]);

  useEffect(() => {
    if (opened && mode === "edit" && initialValues && !initialized && versions.length > 0) {
      setName(initialValues.name);
      setDatasetVersionId(initialValues.datasetVersionId);
      setSplitId(initialValues.splitId || "");
      setWorkflowId(initialValues.workflowId);
      setEvaluatorType(initialValues.evaluatorType);
      const configStr = Object.keys(initialValues.evaluatorConfig).length > 0
        ? JSON.stringify(initialValues.evaluatorConfig, null, 2)
        : "";
      setEvaluatorConfigJson(configStr);

      const rt = initialValues.runtimeSettings;
      setMaxParallelDocuments(typeof rt.maxParallelDocuments === "number" ? rt.maxParallelDocuments : 10);
      setPerDocumentTimeout(typeof rt.perDocumentTimeout === "number" ? rt.perDocumentTimeout : 300000);
      setUseProductionQueue(rt.useProductionQueue === true);

      const ap = initialValues.artifactPolicy;
      const apMode = typeof ap.mode === "string" ? ap.mode : "failures_only";
      setArtifactPolicyMode(apMode);
      if (apMode === "sampled" && typeof ap.sampleRate === "number") {
        setSampleRate(ap.sampleRate);
      }

      const version = versions.find((v) => v.id === initialValues.datasetVersionId);
      if (version?.splits) {
        setSplits(version.splits);
      }

      setInitialized(true);
    }
  }, [opened, mode, initialValues, initialized, versions]);

  const [splits, setSplits] = useState<Split[]>([]);

  const handleVersionChange = (versionId: string | null) => {
    setDatasetVersionId(versionId || "");
    setDatasetVersionError("");
    setSplitId("");
    setSplitError("");

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
    let hasError = false;

    // Validate name
    if (!name.trim()) {
      setNameError("Name is required");
      hasError = true;
    }

    // Validate dataset version
    if (!datasetVersionId) {
      setDatasetVersionError("Dataset version is required");
      hasError = true;
    }

    // Validate workflow
    if (!workflowId) {
      setWorkflowError("Workflow is required");
      hasError = true;
    }

    // Validate evaluator config JSON
    let evaluatorConfig: Record<string, unknown> = {};
    if (evaluatorConfigJson.trim()) {
      try {
        evaluatorConfig = JSON.parse(evaluatorConfigJson);
      } catch {
        setEvaluatorConfigError("Invalid JSON");
        hasError = true;
      }
    }

    if (hasError) {
      return;
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
      ...(splitId ? { splitId } : {}),
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
    setDatasetVersionError("");
    setSplitId("");
    setSplitError("");
    setWorkflowId("");
    setWorkflowError("");
    setEvaluatorType("schema-aware");
    setEvaluatorConfigJson("");
    setEvaluatorConfigError("");
    setMaxParallelDocuments(10);
    setPerDocumentTimeout(300000);
    setUseProductionQueue(false);
    setArtifactPolicyMode("failures_only");
    setSampleRate(0.1);
    setSplits([]);
    setInitialized(false);
    onClose();
  };

  const versionOptions = (() => {
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const v of versions) {
      const groupName = "datasetName" in v ? String(v.datasetName) : "Other";
      const item = {
        value: v.id,
        label: `${v.version} (${v.documentCount} documents)`,
      };
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(item);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  })();

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
      title={mode === "edit" ? "Edit Benchmark Definition" : "Create Benchmark Definition"}
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
          error={datasetVersionError}
          data-testid="dataset-version-select"
        />

        <Select
          label="Split"
          placeholder="All samples (no split)"
          data={splitOptions}
          value={splitId || null}
          onChange={(value) => {
            setSplitId(value || "");
            setSplitError("");
          }}
          disabled={!datasetVersionId}
          clearable
          error={splitError}
          data-testid="split-select"
        />

        <Select
          label="Workflow"
          placeholder="Select workflow"
          data={workflowOptions}
          value={workflowId}
          onChange={(value) => {
            setWorkflowId(value || "");
            setWorkflowError("");
          }}
          disabled={isLoadingWorkflows}
          searchable
          required
          error={workflowError}
          data-testid="workflow-select"
        />

        <Select
          label={
            <Group gap={4} wrap="nowrap" style={{ display: "inline-flex" }}>
              <Text size="sm" fw={500}>Evaluator Type</Text>
              <Tooltip
                label="Determines how workflow outputs are compared to ground truth. Schema-Aware compares structured JSON fields. Black-Box treats the evaluator as an opaque scoring function."
                multiline
                w={300}
              >
                <IconInfoCircle size={14} style={{ opacity: 0.6, cursor: "help" }} />
              </Tooltip>
            </Group>
          }
          data={evaluatorOptions}
          value={evaluatorType}
          onChange={(value) => setEvaluatorType(value || "schema-aware")}
          required
          data-testid="evaluator-type-select"
        />

        <Stack gap={4}>
          <Textarea
            label={
              <Group gap={4} wrap="nowrap" style={{ display: "inline-flex" }}>
                <Text size="sm" fw={500}>Evaluator Config (JSON)</Text>
                <Tooltip
                  label="Optional JSON configuration passed to the evaluator. Keys depend on the evaluator type."
                  multiline
                  w={250}
                >
                  <IconInfoCircle size={14} style={{ opacity: 0.6, cursor: "help" }} />
                </Tooltip>
              </Group>
            }
            placeholder='{"thresholds": {"field_accuracy": 0.9}}'
            value={evaluatorConfigJson}
            onChange={(e) => {
              setEvaluatorConfigJson(e.target.value);
              setEvaluatorConfigError("");
            }}
            error={evaluatorConfigError}
            minRows={3}
            data-testid="evaluator-config-textarea"
          />
          <Text size="xs" c="dimmed">
            Example: <Code>{'{"thresholds": {"field_accuracy": 0.9, "schema_coverage": 0.95}}'}</Code>
          </Text>
        </Stack>

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
          label={
            <Group gap={4} wrap="nowrap" style={{ display: "inline-flex" }}>
              <Text size="sm" fw={500}>Use Production Queue</Text>
              <Tooltip
                label="When enabled, benchmark documents are processed on the production task queue instead of a dedicated benchmark queue. Useful for measuring real-world throughput, but may affect production traffic."
                multiline
                w={300}
              >
                <IconInfoCircle size={14} style={{ opacity: 0.6, cursor: "help" }} />
              </Tooltip>
            </Group>
          }
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
          label={
            <Group gap={4} wrap="nowrap" style={{ display: "inline-flex" }}>
              <Text size="sm" fw={500}>Artifact Policy</Text>
              <Tooltip
                label="Controls which run outputs are stored. 'Full' saves all outputs, 'Failures Only' saves outputs only for failing samples, 'Sampled' saves a random subset."
                multiline
                w={300}
              >
                <IconInfoCircle size={14} style={{ opacity: 0.6, cursor: "help" }} />
              </Tooltip>
            </Group>
          }
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
            {mode === "edit" ? "Save Changes" : "Create"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
