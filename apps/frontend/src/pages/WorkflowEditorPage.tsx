import {
  Badge,
  Button,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { json } from "@codemirror/lang-json";
import { Diagnostic, lintGutter, linter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
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
  workflowId?: string;
  onBack?: () => void;
  onSave?: () => void;
}

const DEFAULT_GRAPH_CONFIG: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: {
    name: "New workflow",
    version: "1.0.0",
  },
  ctx: {
    documentId: { type: "string" },
  },
  nodes: {
    start: {
      id: "start",
      type: "activity",
      label: "Start",
      activityType: "document.updateStatus",
      inputs: [{ port: "documentId", ctxKey: "documentId" }],
      outputs: [{ port: "status", ctxKey: "status" }],
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
      message: "schemaVersion must be \"1.0\".",
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

function parseJsonErrorPosition(
  message: string,
  documentText: string,
): number {
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

export function WorkflowEditorPage({
  mode,
  workflowId,
  onBack,
  onSave,
}: WorkflowEditorPageProps) {
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
  const initializedRef = useRef(false);

  useEffect(() => {
    if (mode === "edit" && data && !initializedRef.current) {
      initializedRef.current = true;
      setWorkflowName(data.name);
      setWorkflowDescription(data.description ?? "");
      setJsonValue(JSON.stringify(data.config, null, 2));
    }
  }, [mode, data]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(debouncedJson) as unknown;
      setJsonError(null);
      const errors = validateGraphConfig(parsed);
      setValidationErrors(errors);
      if (errors.length === 0 && isRecord(parsed)) {
        setParsedConfig(parsed as GraphWorkflowConfig);
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
      onSave?.();
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
          {onBack ? (
            <Button variant="subtle" onClick={onBack}>
              Back
            </Button>
          ) : null}
          <Button onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" gap="xl">
        <Stack style={{ flex: 1 }} gap="md">
          <Paper withBorder p="md">
            <Stack gap="sm">
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
          </Paper>

          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <Text fw={600}>Graph config (JSON)</Text>
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
              <Button variant="light" size="xs" onClick={handleFormat}>
                Format JSON
              </Button>
            </Group>

            <Paper withBorder>
              <CodeMirror
                value={jsonValue}
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

            <Collapse in={showErrors && (jsonError || validationErrors.length > 0)}>
              <Paper withBorder p="sm" mt="sm">
                <Stack gap="xs">
                  {jsonError ? (
                    <Text c="red" size="sm">
                      {jsonError}
                    </Text>
                  ) : null}
                  {validationErrors.map((err) => (
                    <Text key={`${err.path}-${err.message}`} c="red" size="sm">
                      {err.path}: {err.message}
                    </Text>
                  ))}
                </Stack>
              </Paper>
            </Collapse>
          </Paper>
        </Stack>

        <Paper withBorder p="md" style={{ flex: 1 }}>
          <Stack gap="xs">
            <Text fw={600}>Workflow preview</Text>
            <ScrollArea h={620} />
          </Stack>
        </Paper>
      </Group>
    </Stack>
  );
}
