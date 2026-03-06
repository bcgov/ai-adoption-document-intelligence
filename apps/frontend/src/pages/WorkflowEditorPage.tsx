import { json } from "@codemirror/lang-json";
import { Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import {
  Badge,
  Button,
  Collapse,
  Flex,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GraphConfigFormEditor } from "../components/workflow/GraphConfigFormEditor";
import { GraphVisualization } from "../components/workflow/GraphVisualization";
import {
  CreateWorkflowDto,
  useCreateWorkflow,
  useUpdateWorkflow,
  useWorkflow,
} from "../data/hooks/useWorkflows";
import { GraphWorkflowConfig } from "../types/workflow";

interface GraphValidationError {
  path: string;
  message: string;
}

interface WorkflowEditorPageProps {
  mode: "create" | "edit";
}

const DEFAULT_GRAPH_CONFIG: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: {
    name: "New workflow",
    version: "1.0.0",
  },
  ctx: {
    documentId: { type: "string" },
    blobKey: { type: "string" },
    fileName: { type: "string" },
  },
  nodes: {
    start: {
      id: "start",
      type: "activity",
      label: "Prepare File",
      activityType: "file.prepare",
      inputs: [
        { port: "blobKey", ctxKey: "blobKey" },
        { port: "fileName", ctxKey: "fileName" },
      ],
      outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
    },
  },
  edges: [],
  entryNodeId: "start",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateGraphConfig(value: unknown): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  if (!isRecord(value)) {
    return [{ path: "root", message: "Config must be a JSON object." }];
  }

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== "1.0") {
    errors.push({
      path: "schemaVersion",
      message: 'schemaVersion must be "1.0".',
    });
  }

  const nodes = value.nodes;
  if (!isRecord(nodes) || Object.keys(nodes).length === 0) {
    errors.push({
      path: "nodes",
      message: "At least one node is required.",
    });
  }

  const entryNodeId = value.entryNodeId;
  if (typeof entryNodeId !== "string" || entryNodeId.trim() === "") {
    errors.push({
      path: "entryNodeId",
      message: "entryNodeId must be a non-empty string.",
    });
  } else if (isRecord(nodes) && !nodes[entryNodeId]) {
    errors.push({
      path: "entryNodeId",
      message: "entryNodeId must match an existing node id.",
    });
  }

  if (isRecord(nodes)) {
    Object.values(nodes).forEach((node) => {
      if (!isRecord(node)) {
        errors.push({
          path: "nodes",
          message: "Each node must be an object.",
        });
        return;
      }
      if (typeof node.id !== "string" || node.id.trim() === "") {
        errors.push({
          path: "nodes.id",
          message: "Each node must have a string id.",
        });
      }
      if (typeof node.type !== "string") {
        errors.push({
          path: "nodes.type",
          message: "Each node must have a type.",
        });
      }
      if (typeof node.label !== "string") {
        errors.push({
          path: "nodes.label",
          message: "Each node must have a label.",
        });
      }
    });
  }

  const edges = value.edges;
  if (!Array.isArray(edges)) {
    errors.push({
      path: "edges",
      message: "edges must be an array.",
    });
  } else if (isRecord(nodes)) {
    edges.forEach((edge, index) => {
      if (!isRecord(edge)) {
        errors.push({
          path: `edges[${index}]`,
          message: "Each edge must be an object.",
        });
        return;
      }
      if (typeof edge.source !== "string" || typeof edge.target !== "string") {
        errors.push({
          path: `edges[${index}]`,
          message: "Each edge must have source and target ids.",
        });
        return;
      }
      if (!nodes[edge.source] || !nodes[edge.target]) {
        errors.push({
          path: `edges[${index}]`,
          message: "Edge source/target must match existing node ids.",
        });
      }
    });
  }

  return errors;
}

function parseJsonErrorPosition(message: string, documentText: string): number {
  const match = /position\s+(\d+)/i.exec(message);
  const fallback = Math.min(0, documentText.length);
  if (!match) {
    return fallback;
  }
  const position = Number.parseInt(match[1] ?? "0", 10);
  if (Number.isNaN(position)) {
    return fallback;
  }
  return Math.min(Math.max(position, 0), documentText.length);
}

function locatePath(
  documentText: string,
  path: string,
): { from: number; to: number } | null {
  const [rootKey] = path.split(/[.[\]]/).filter(Boolean);
  if (!rootKey) {
    return null;
  }
  const keyToken = `"${rootKey}"`;
  const index = documentText.indexOf(keyToken);
  if (index < 0) {
    return null;
  }
  return { from: index + 1, to: index + keyToken.length - 1 };
}

function buildDiagnostics(
  documentText: string,
  jsonError: string | null,
  validationErrors: GraphValidationError[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (jsonError) {
    const position = parseJsonErrorPosition(jsonError, documentText);
    diagnostics.push({
      from: position,
      to: Math.min(position + 1, documentText.length),
      severity: "error",
      message: jsonError,
    });
    return diagnostics;
  }

  validationErrors.forEach((error) => {
    const range = locatePath(documentText, error.path);
    const from = range?.from ?? 0;
    const to = range?.to ?? Math.min(1, documentText.length);
    diagnostics.push({
      from,
      to,
      severity: "error",
      message: `${error.path}: ${error.message}`,
    });
  });

  return diagnostics;
}

function formatJson(value: string): string | null {
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

export function WorkflowEditorPage({ mode }: WorkflowEditorPageProps) {
  const navigate = useNavigate();
  const { workflowId } = useParams();
  const createWorkflowMutation = useCreateWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const { data, isLoading, error } = useWorkflow(workflowId ?? "");

  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [jsonValue, setJsonValue] = useState(() =>
    JSON.stringify(DEFAULT_GRAPH_CONFIG, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    GraphValidationError[]
  >([]);
  const [showErrors, setShowErrors] = useState(true);
  const [parsedConfig, setParsedConfig] = useState<GraphWorkflowConfig | null>(
    DEFAULT_GRAPH_CONFIG,
  );
  const [debouncedJson] = useDebouncedValue(jsonValue, 300);
  const [viewMode, setViewMode] = useState<"detailed" | "simplified">(
    "simplified",
  );
  const [configEditorMode, setConfigEditorMode] = useState<"form" | "json">(
    "form",
  );
  const initializedRef = useRef(false);
  const initialSnapshotRef = useRef<{
    name: string;
    description: string;
    json: string;
  }>({
    name: "",
    description: "",
    json: JSON.stringify(DEFAULT_GRAPH_CONFIG, null, 2),
  });

  useEffect(() => {
    if (mode === "edit" && data && !initializedRef.current) {
      initializedRef.current = true;
      const initialJson = JSON.stringify(data.config, null, 2);
      setWorkflowName(data.name);
      setWorkflowDescription(data.description ?? "");
      setJsonValue(initialJson);
      initialSnapshotRef.current = {
        name: data.name,
        description: data.description ?? "",
        json: initialJson,
      };
      return;
    }

    if (mode === "create" && !initializedRef.current) {
      initializedRef.current = true;
      initialSnapshotRef.current = {
        name: "",
        description: "",
        json: JSON.stringify(DEFAULT_GRAPH_CONFIG, null, 2),
      };
    }
  }, [mode, data]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(debouncedJson) as unknown;
      setJsonError(null);
      const errors = validateGraphConfig(parsed);
      setValidationErrors(errors);
      if (errors.length === 0 && isRecord(parsed)) {
        setParsedConfig(parsed as unknown as GraphWorkflowConfig);
      } else {
        setParsedConfig(null);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid JSON value.";
      setJsonError(message);
      setValidationErrors([]);
      setParsedConfig(null);
    }
  }, [debouncedJson]);

  const diagnostics = useMemo(
    () => buildDiagnostics(jsonValue, jsonError, validationErrors),
    [jsonValue, jsonError, validationErrors],
  );

  const canSave =
    !jsonError &&
    validationErrors.length === 0 &&
    workflowName.trim().length > 0;

  const handleFormConfigChange = (newConfig: GraphWorkflowConfig) => {
    setParsedConfig(newConfig);
    setJsonValue(JSON.stringify(newConfig, null, 2));
    setJsonError(null);
    setValidationErrors([]);
  };

  const handleFormat = () => {
    const formatted = formatJson(jsonValue);
    if (!formatted) {
      notifications.show({
        title: "Invalid JSON",
        message: "Fix JSON syntax before formatting.",
        color: "red",
      });
      return;
    }
    setJsonValue(formatted);
  };

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(jsonValue) as unknown;
      setJsonError(null);
      const errors = validateGraphConfig(parsed);
      setValidationErrors(errors);
      setShowErrors(true);
      if (errors.length === 0 && isRecord(parsed)) {
        setParsedConfig(parsed as unknown as GraphWorkflowConfig);
        notifications.show({
          title: "Validation passed",
          message: "Graph config looks valid.",
          color: "green",
        });
      } else {
        notifications.show({
          title: "Validation errors",
          message: "Fix the highlighted errors before saving.",
          color: "red",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid JSON value.";
      setJsonError(message);
      setValidationErrors([]);
      setParsedConfig(null);
      setShowErrors(true);
      notifications.show({
        title: "Invalid JSON",
        message: "Fix JSON syntax before validating.",
        color: "red",
      });
    }
  };

  const handleReset = () => {
    const snapshot = initialSnapshotRef.current;
    setWorkflowName(snapshot.name);
    setWorkflowDescription(snapshot.description);
    setJsonValue(snapshot.json);
    setJsonError(null);
    setValidationErrors([]);
    setParsedConfig(null);
    setShowErrors(false);
  };

  const handleSave = async () => {
    if (!workflowName.trim()) {
      notifications.show({
        title: "Missing name",
        message: "Workflow name is required.",
        color: "red",
      });
      return;
    }

    let configToSave: GraphWorkflowConfig | null = parsedConfig;
    if (!configToSave) {
      const formatted = formatJson(jsonValue);
      if (!formatted) {
        notifications.show({
          title: "Invalid JSON",
          message: "Fix JSON syntax before saving.",
          color: "red",
        });
        return;
      }
      const parsed = JSON.parse(formatted) as unknown;
      const errors = validateGraphConfig(parsed);
      if (errors.length > 0) {
        setValidationErrors(errors);
        setShowErrors(true);
        notifications.show({
          title: "Validation errors",
          message: "Fix validation errors before saving.",
          color: "red",
        });
        return;
      }
      configToSave = parsed as GraphWorkflowConfig;
    }

    const payload: CreateWorkflowDto = {
      name: workflowName.trim(),
      description: workflowDescription.trim() || undefined,
      config: configToSave,
    };

    try {
      if (mode === "create") {
        await createWorkflowMutation.mutateAsync(payload);
        notifications.show({
          title: "Workflow created",
          message: `Created "${workflowName}".`,
          color: "green",
        });
      } else if (mode === "edit" && workflowId) {
        await updateWorkflowMutation.mutateAsync({
          id: workflowId,
          dto: payload,
        });
        notifications.show({
          title: "Workflow updated",
          message: `Updated "${workflowName}".`,
          color: "green",
        });
      }
      initialSnapshotRef.current = {
        name: workflowName.trim(),
        description: workflowDescription.trim(),
        json: JSON.stringify(configToSave, null, 2),
      };
      navigate("/workflows");
    } catch (saveError) {
      notifications.show({
        title: "Save failed",
        message:
          saveError instanceof Error
            ? saveError.message
            : "Unable to save workflow.",
        color: "red",
      });
    }
  };

  if (mode === "edit" && isLoading) {
    return (
      <Stack>
        <Title order={3}>Workflow editor</Title>
        <Text c="dimmed">Loading workflow...</Text>
      </Stack>
    );
  }

  if (mode === "edit" && error) {
    return (
      <Stack>
        <Title order={3}>Workflow editor</Title>
        <Text c="red">Unable to load workflow.</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={3}>
          {mode === "create" ? "Create workflow" : "Edit workflow"}
        </Title>
        <Group>
          <Button variant="subtle" onClick={() => navigate("/workflows")}>
            Back
          </Button>
          <Button variant="light" onClick={handleValidate}>
            Validate
          </Button>
          <Button variant="light" onClick={handleFormat}>
            Format JSON
          </Button>
          <Button variant="light" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </Group>
      </Group>

      <Paper withBorder p="md">
        <Group justify="space-between" align="center">
          <Stack gap={4} style={{ flex: 1 }}>
            <TextInput
              label="Workflow name"
              value={workflowName}
              onChange={(event) => setWorkflowName(event.currentTarget.value)}
              placeholder="Enter workflow name"
              required
            />
            <TextInput
              label="Description"
              value={workflowDescription}
              onChange={(event) =>
                setWorkflowDescription(event.currentTarget.value)
              }
              placeholder="Optional description"
            />
          </Stack>
          {mode === "edit" && data ? (
            <Badge variant="light" color="gray">
              Version {data.version}
            </Badge>
          ) : null}
        </Group>
      </Paper>

      <Flex align="flex-start" gap="xl" wrap="nowrap" style={{ minWidth: 0 }}>
        <Stack style={{ flex: "1 1 50%", minWidth: 0 }} gap="md">
          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <SegmentedControl
                  size="sm"
                  value={configEditorMode}
                  onChange={(v) => setConfigEditorMode(v as "form" | "json")}
                  data={[
                    { label: "Form", value: "form" },
                    { label: "JSON", value: "json" },
                  ]}
                />
                <Text fw={600}>
                  {configEditorMode === "form"
                    ? "Graph config (form)"
                    : "Graph config (JSON)"}
                </Text>
                {jsonError || validationErrors.length > 0 ? (
                  <Badge color="red" variant="light">
                    Errors
                  </Badge>
                ) : (
                  <Badge color="green" variant="light">
                    Valid
                  </Badge>
                )}
              </Group>
            </Group>

            {configEditorMode === "form" ? (
              <Paper
                withBorder
                p="md"
                style={{ maxHeight: 520, overflow: "auto" }}
              >
                <GraphConfigFormEditor
                  value={parsedConfig ?? DEFAULT_GRAPH_CONFIG}
                  onChange={handleFormConfigChange}
                />
              </Paper>
            ) : (
              <>
                <Paper withBorder>
                  <CodeMirror
                    value={jsonValue}
                    theme="dark"
                    height="520px"
                    extensions={[
                      json(),
                      lintGutter(),
                      linter(() => diagnostics),
                      EditorView.lineWrapping,
                    ]}
                    onChange={(value) => setJsonValue(value)}
                  />
                </Paper>

                <Group justify="space-between" mt="sm">
                  <Text size="sm" c="dimmed">
                    Changes sync after 300ms.
                  </Text>
                  {(jsonError || validationErrors.length > 0) && (
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => setShowErrors((prev) => !prev)}
                    >
                      {showErrors ? "Hide errors" : "Show errors"}
                    </Button>
                  )}
                </Group>

                <Collapse
                  in={
                    showErrors &&
                    Boolean(jsonError || validationErrors.length > 0)
                  }
                >
                  <Paper withBorder p="sm" mt="sm">
                    <Stack gap="xs">
                      {jsonError ? (
                        <Text c="red" size="sm">
                          {jsonError}
                        </Text>
                      ) : null}
                      {validationErrors.map((err) => (
                        <Text
                          key={`${err.path}-${err.message}`}
                          c="red"
                          size="sm"
                        >
                          {err.path}: {err.message}
                        </Text>
                      ))}
                    </Stack>
                  </Paper>
                </Collapse>
              </>
            )}
          </Paper>
        </Stack>

        <Paper withBorder p="md" style={{ flex: "1 1 50%", minWidth: 0 }}>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text fw={600}>Workflow preview</Text>
              {parsedConfig?.nodeGroups &&
                Object.keys(parsedConfig.nodeGroups).length > 0 && (
                  <SegmentedControl
                    size="xs"
                    value={viewMode}
                    onChange={(value) =>
                      setViewMode(value as "detailed" | "simplified")
                    }
                    data={[
                      { label: "Detailed", value: "detailed" },
                      { label: "Simplified", value: "simplified" },
                    ]}
                  />
                )}
            </Group>
            <GraphVisualization
              config={parsedConfig}
              validationErrors={validationErrors}
              viewMode={viewMode}
            />
          </Stack>
        </Paper>
      </Flex>
    </Stack>
  );
}
