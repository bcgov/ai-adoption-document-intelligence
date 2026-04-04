import {
  Button,
  Code,
  Group,
  Modal,
  NumberInput,
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
  workflowVersionId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  workflowConfigOverrides?: Record<string, unknown>;
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
  workflowVersionId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  workflowConfigOverrides?: Record<string, unknown>;
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
  const [workflowVersionId, setWorkflowVersionId] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [evaluatorType, setEvaluatorType] = useState("schema-aware");
  const [evaluatorConfigJson, setEvaluatorConfigJson] = useState("");
  const [evaluatorConfigError, setEvaluatorConfigError] = useState("");
  const [maxParallelDocuments, setMaxParallelDocuments] = useState(10);
  const [perDocumentTimeout, setPerDocumentTimeout] = useState(300000);
  const [initialized, setInitialized] = useState(false);
  const [workflowConfigOverridesJson, setWorkflowConfigOverridesJson] =
    useState("");
  const [workflowConfigOverridesError, setWorkflowConfigOverridesError] =
    useState("");

  const {
    versions,
    isLoading: isLoadingVersions,
    refetch: refetchVersions,
  } = useAllDatasetVersions();
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
    if (
      opened &&
      mode === "edit" &&
      initialValues &&
      !initialized &&
      versions.length > 0
    ) {
      setName(initialValues.name);
      setDatasetVersionId(initialValues.datasetVersionId);
      setSplitId(initialValues.splitId || "");
      setWorkflowVersionId(initialValues.workflowVersionId);
      setEvaluatorType(initialValues.evaluatorType);
      const configStr =
        Object.keys(initialValues.evaluatorConfig).length > 0
          ? JSON.stringify(initialValues.evaluatorConfig, null, 2)
          : "";
      setEvaluatorConfigJson(configStr);

      const rt = initialValues.runtimeSettings;
      setMaxParallelDocuments(
        typeof rt.maxParallelDocuments === "number"
          ? rt.maxParallelDocuments
          : 10,
      );
      setPerDocumentTimeout(
        typeof rt.perDocumentTimeout === "number"
          ? rt.perDocumentTimeout
          : 300000,
      );

      const version = versions.find(
        (v) => v.id === initialValues.datasetVersionId,
      );
      if (version?.splits) {
        setSplits(version.splits);
      }

      if (
        initialValues.workflowConfigOverrides &&
        Object.keys(initialValues.workflowConfigOverrides).length > 0
      ) {
        setWorkflowConfigOverridesJson(
          JSON.stringify(initialValues.workflowConfigOverrides, null, 2),
        );
      } else if (initialValues.workflowVersionId) {
        const defaults = getExposedParamDefaults(
          initialValues.workflowVersionId,
        );
        if (Object.keys(defaults).length > 0) {
          setWorkflowConfigOverridesJson(JSON.stringify(defaults, null, 2));
        }
      }

      setInitialized(true);
    }
  }, [opened, mode, initialValues, initialized, versions]);

  const [splits, setSplits] = useState<Split[]>([]);

  const getExposedParamDefaults = (wfId: string): Record<string, unknown> => {
    const workflow = workflows.find((w) => w.id === wfId);
    if (!workflow?.config) return {};
    const nodeGroups = workflow.config.nodeGroups as
      | Record<
          string,
          {
            exposedParams?: Array<{
              path: string;
            }>;
          }
        >
      | undefined;
    if (!nodeGroups) return {};

    // Resolve each exposed param's path against the actual config
    // to get the real runtime default, not a potentially-stale value.
    const resolvePathValue = (path: string): unknown => {
      const parts = path.split(".");
      let current: unknown = workflow.config;
      for (const part of parts) {
        if (
          current === undefined ||
          current === null ||
          typeof current !== "object"
        ) {
          return undefined;
        }
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    };

    const defaults: Record<string, unknown> = {};
    for (const group of Object.values(nodeGroups)) {
      if (!group.exposedParams) continue;
      for (const param of group.exposedParams) {
        defaults[param.path] = resolvePathValue(param.path);
      }
    }
    return defaults;
  };

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
    if (!workflowVersionId) {
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

    // Validate workflow config overrides JSON
    let workflowConfigOverrides: Record<string, unknown> = {};
    if (workflowConfigOverridesJson.trim()) {
      try {
        workflowConfigOverrides = JSON.parse(workflowConfigOverridesJson);
      } catch {
        setWorkflowConfigOverridesError("Invalid JSON");
        hasError = true;
      }
    }

    if (hasError) {
      return;
    }

    const runtimeSettings: Record<string, unknown> = {
      maxParallelDocuments,
      perDocumentTimeout,
    };

    onCreate({
      name,
      datasetVersionId,
      ...(splitId ? { splitId } : {}),
      workflowVersionId,
      evaluatorType,
      evaluatorConfig,
      runtimeSettings,
      ...(Object.keys(workflowConfigOverrides).length > 0
        ? { workflowConfigOverrides }
        : {}),
    });
  };

  const handleClose = () => {
    setName("");
    setNameError("");
    setDatasetVersionId("");
    setDatasetVersionError("");
    setSplitId("");
    setSplitError("");
    setWorkflowVersionId("");
    setWorkflowError("");
    setEvaluatorType("schema-aware");
    setEvaluatorConfigJson("");
    setEvaluatorConfigError("");
    setMaxParallelDocuments(10);
    setPerDocumentTimeout(300000);
    setSplits([]);
    setInitialized(false);
    setWorkflowConfigOverridesJson("");
    setWorkflowConfigOverridesError("");
    onClose();
  };

  const versionOptions = (() => {
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const v of versions) {
      const groupName = "datasetName" in v ? String(v.datasetName) : "Other";
      const nameLabel = v.name ? `${v.version} — ${v.name}` : v.version;
      const item = {
        value: v.id,
        label: `${nameLabel} (${v.documentCount} documents)`,
      };
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(item);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({
      group,
      items,
    }));
  })();

  const splitOptions = splits.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.type})`,
  }));

  const workflowOptions = workflows.map((w) => ({
    value: w.workflowVersionId,
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
      title={
        mode === "edit"
          ? "Edit Benchmark Definition"
          : "Create Benchmark Definition"
      }
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
          value={workflowVersionId}
          onChange={(value) => {
            setWorkflowVersionId(value || "");
            setWorkflowError("");
            if (value) {
              const defaults = getExposedParamDefaults(value);
              if (Object.keys(defaults).length > 0) {
                setWorkflowConfigOverridesJson(
                  JSON.stringify(defaults, null, 2),
                );
              } else {
                setWorkflowConfigOverridesJson("");
              }
            } else {
              setWorkflowConfigOverridesJson("");
            }
            setWorkflowConfigOverridesError("");
          }}
          disabled={isLoadingWorkflows}
          searchable
          required
          error={workflowError}
          data-testid="workflow-select"
        />

        {workflowConfigOverridesJson && (
          <Stack gap={4}>
            <Textarea
              label={
                <Group gap={4} wrap="nowrap" style={{ display: "inline-flex" }}>
                  <Text size="sm" fw={500}>
                    Workflow Config Overrides (JSON)
                  </Text>
                  <Tooltip
                    label="Override workflow parameters like OCR model, confidence threshold, etc. Keys are parameter paths from the workflow's exposed parameters."
                    multiline
                    w={300}
                  >
                    <IconInfoCircle
                      size={14}
                      style={{ opacity: 0.6, cursor: "help" }}
                    />
                  </Tooltip>
                </Group>
              }
              placeholder="{}"
              value={workflowConfigOverridesJson}
              onChange={(e) => {
                setWorkflowConfigOverridesJson(e.target.value);
                setWorkflowConfigOverridesError("");
              }}
              error={workflowConfigOverridesError}
              minRows={4}
              autosize
              styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
              data-testid="workflow-config-overrides-textarea"
            />
          </Stack>
        )}

        <Select
          label={
            <Group gap={4} wrap="nowrap" style={{ display: "inline-flex" }}>
              <Text size="sm" fw={500}>
                Evaluator Type
              </Text>
              <Tooltip
                label="Determines how workflow outputs are compared to ground truth. Schema-Aware compares structured JSON fields. Black-Box treats the evaluator as an opaque scoring function."
                multiline
                w={300}
              >
                <IconInfoCircle
                  size={14}
                  style={{ opacity: 0.6, cursor: "help" }}
                />
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
                <Text size="sm" fw={500}>
                  Evaluator Config (JSON)
                </Text>
                <Tooltip
                  label="Optional JSON configuration passed to the evaluator. Keys depend on the evaluator type."
                  multiline
                  w={250}
                >
                  <IconInfoCircle
                    size={14}
                    style={{ opacity: 0.6, cursor: "help" }}
                  />
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
            Example:{" "}
            <Code>
              {
                '{"thresholds": {"field_accuracy": 0.9, "schema_coverage": 0.95}}'
              }
            </Code>
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

        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={handleClose}
            data-testid="cancel-definition-btn"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isCreating}
            data-testid="submit-definition-btn"
          >
            {mode === "edit" ? "Save Changes" : "Create"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
