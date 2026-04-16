/**
 * Form editor for GraphWorkflowConfig.
 * Edits metadata, ctx, entry node, nodes (with type-specific fields), and edges.
 */

import {
  Accordion,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRef } from "react";
import type {
  ActivityNode,
  CtxDeclaration,
  GraphEdge,
  GraphMetadata,
  GraphNode,
  GraphWorkflowConfig,
  NodeType,
  PortBinding,
  TransformNode,
} from "../../types/graph-workflow";

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: "activity", label: "Activity" },
  { value: "switch", label: "Switch" },
  { value: "map", label: "Map" },
  { value: "join", label: "Join" },
  { value: "childWorkflow", label: "Child workflow" },
  { value: "pollUntil", label: "Poll until" },
  { value: "humanGate", label: "Human gate" },
  { value: "transform", label: "Data Transformation" },
];

const CTX_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "object", label: "Object" },
  { value: "array", label: "Array" },
] as const;

const EDGE_TYPES = [
  { value: "normal", label: "Normal" },
  { value: "conditional", label: "Conditional" },
  { value: "error", label: "Error" },
];

const OCR_ENRICH_ACTIVITY_TYPE = "ocr.enrich";

const FORMAT_OPTIONS = [
  { value: "json", label: "JSON" },
  { value: "xml", label: "XML" },
  { value: "csv", label: "CSV" },
] as const;

export interface GraphConfigFormEditorProps {
  value: GraphWorkflowConfig;
  onChange: (config: GraphWorkflowConfig) => void;
}

function defaultNodeForType(type: NodeType, id: string): GraphNode {
  const base = { id, type, label: id };
  switch (type) {
    case "activity":
      return {
        ...base,
        type: "activity",
        activityType: "",
        inputs: [],
        outputs: [],
      } as ActivityNode;
    case "switch":
      return { ...base, type: "switch", cases: [] };
    case "map":
      return {
        ...base,
        type: "map",
        collectionCtxKey: "",
        itemCtxKey: "",
        bodyEntryNodeId: "",
        bodyExitNodeId: "",
      };
    case "join":
      return {
        ...base,
        type: "join",
        sourceMapNodeId: "",
        strategy: "all",
        resultsCtxKey: "",
      };
    case "childWorkflow":
      return {
        ...base,
        type: "childWorkflow",
        workflowRef: { type: "library", workflowId: "" },
      };
    case "pollUntil":
      return {
        ...base,
        type: "pollUntil",
        activityType: "",
        condition: {
          operator: "equals",
          left: { ref: "ctx.status" },
          right: { literal: "done" },
        },
        interval: "5s",
      };
    case "humanGate":
      return {
        ...base,
        type: "humanGate",
        signal: { name: "approve" },
        timeout: "24h",
        onTimeout: "fail",
      };
    case "transform":
      return {
        ...base,
        type: "transform",
        inputFormat: "json",
        outputFormat: "json",
        fieldMapping: "{}",
      } as TransformNode;
    default:
      return { ...base, type: "activity", activityType: "" } as ActivityNode;
  }
}

export function GraphConfigFormEditor({
  value,
  onChange,
}: GraphConfigFormEditorProps) {
  const nodeIds = Object.keys(value.nodes);

  const setMetadata = (metadata: GraphMetadata) => {
    onChange({ ...value, metadata });
  };

  const setCtx = (ctx: Record<string, CtxDeclaration>) => {
    onChange({ ...value, ctx });
  };

  const setEntryNodeId = (entryNodeId: string) => {
    onChange({ ...value, entryNodeId });
  };

  const setNodes = (nodes: Record<string, GraphNode>) => {
    onChange({ ...value, nodes });
  };

  const setEdges = (edges: GraphEdge[]) => {
    onChange({ ...value, edges });
  };

  const addCtxKey = () => {
    const key = `key_${Object.keys(value.ctx).length}`;
    setCtx({
      ...value.ctx,
      [key]: { type: "string" },
    });
  };

  const updateCtxKey = (
    oldKey: string,
    newKey: string,
    decl: CtxDeclaration,
  ) => {
    const next = { ...value.ctx };
    delete next[oldKey];
    if (newKey.trim()) next[newKey.trim()] = decl;
    setCtx(next);
  };

  const removeCtxKey = (key: string) => {
    const next = { ...value.ctx };
    delete next[key];
    setCtx(next);
  };

  const addNode = () => {
    const id = `node_${nodeIds.length}`;
    const nodes = { ...value.nodes, [id]: defaultNodeForType("activity", id) };
    setNodes(nodes);
    if (nodeIds.length === 0) setEntryNodeId(id);
  };

  const updateNode = (nodeId: string, node: GraphNode) => {
    const nodes = { ...value.nodes, [nodeId]: node };
    setNodes(nodes);
  };

  const removeNode = (nodeId: string) => {
    const nodes = { ...value.nodes };
    delete nodes[nodeId];
    setNodes(nodes);
    const edges = value.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    );
    setEdges(edges);
    if (value.entryNodeId === nodeId) {
      const nextId = Object.keys(nodes)[0] ?? "";
      setEntryNodeId(nextId);
    }
  };

  const addEdge = () => {
    const id = `edge_${value.edges.length}`;
    const source = nodeIds[0] ?? "";
    const target = nodeIds[1] ?? source;
    setEdges([...value.edges, { id, source, target, type: "normal" }]);
  };

  const updateEdge = (index: number, edge: GraphEdge) => {
    const edges = [...value.edges];
    edges[index] = edge;
    setEdges(edges);
  };

  const removeEdge = (index: number) => {
    setEdges(value.edges.filter((_, i) => i !== index));
  };

  return (
    <Stack gap="md">
      <Accordion
        variant="contained"
        defaultValue={["metadata", "ctx", "entry", "nodes", "edges"]}
        multiple
      >
        <Accordion.Item value="metadata">
          <Accordion.Control>Metadata</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <TextInput
                label="Name"
                value={value.metadata.name ?? ""}
                onChange={(e) =>
                  setMetadata({
                    ...value.metadata,
                    name: e.currentTarget.value || undefined,
                  })
                }
                placeholder="Workflow name"
              />
              <TextInput
                label="Description"
                value={value.metadata.description ?? ""}
                onChange={(e) =>
                  setMetadata({
                    ...value.metadata,
                    description: e.currentTarget.value || undefined,
                  })
                }
                placeholder="Optional description"
              />
              <TextInput
                label="Version"
                value={value.metadata.version ?? ""}
                onChange={(e) =>
                  setMetadata({
                    ...value.metadata,
                    version: e.currentTarget.value || undefined,
                  })
                }
                placeholder="e.g. 1.0.0"
              />
              <TextInput
                label="Tags (comma-separated)"
                value={(value.metadata.tags ?? []).join(", ")}
                onChange={(e) => {
                  const tags = e.currentTarget.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setMetadata({
                    ...value.metadata,
                    tags: tags.length ? tags : undefined,
                  });
                }}
                placeholder="tag1, tag2"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="ctx">
          <Accordion.Control>Context (ctx)</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              {Object.entries(value.ctx).map(([key, decl]) => (
                <Paper key={key} withBorder p="sm">
                  <Group gap="xs" wrap="nowrap" align="flex-end">
                    <TextInput
                      label="Key"
                      value={key}
                      onChange={(e) =>
                        updateCtxKey(key, e.currentTarget.value, decl)
                      }
                      placeholder="ctx key"
                      style={{ minWidth: 120 }}
                    />
                    <Select
                      label="Type"
                      data={CTX_TYPES}
                      value={decl.type}
                      onChange={(v) =>
                        updateCtxKey(key, key, {
                          ...decl,
                          type: (v as CtxDeclaration["type"]) ?? "string",
                        })
                      }
                      style={{ minWidth: 100 }}
                    />
                    <TextInput
                      label="Description"
                      value={decl.description ?? ""}
                      onChange={(e) =>
                        updateCtxKey(key, key, {
                          ...decl,
                          description: e.currentTarget.value || undefined,
                        })
                      }
                      placeholder="Optional"
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => removeCtxKey(key)}
                      leftSection={<IconTrash size={14} />}
                    >
                      Remove
                    </Button>
                  </Group>
                </Paper>
              ))}
              <Button
                variant="light"
                size="sm"
                leftSection={<IconPlus size={14} />}
                onClick={addCtxKey}
              >
                Add context variable
              </Button>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="entry">
          <Accordion.Control>Entry node</Accordion.Control>
          <Accordion.Panel>
            <Select
              label="Entry node ID"
              data={nodeIds}
              value={value.entryNodeId || (nodeIds[0] ?? null)}
              onChange={(v) => setEntryNodeId(v ?? value.entryNodeId)}
              placeholder="Select entry node"
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="nodes">
          <Accordion.Control>Nodes</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              {nodeIds.map((nodeId) => {
                const node = value.nodes[nodeId];
                if (!node) return null;
                return (
                  <Paper key={nodeId} withBorder p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={500}>{nodeId}</Text>
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() => removeNode(nodeId)}
                          leftSection={<IconTrash size={12} />}
                        >
                          Remove
                        </Button>
                      </Group>
                      <Group gap="sm" wrap="wrap">
                        <TextInput
                          label="Label"
                          value={node.label}
                          onChange={(e) =>
                            updateNode(nodeId, {
                              ...node,
                              label: e.currentTarget.value,
                            })
                          }
                          placeholder="Display label"
                          style={{ minWidth: 140 }}
                        />
                        <Select
                          label="Type"
                          data={NODE_TYPES}
                          value={node.type}
                          onChange={(v) => {
                            const newType = (v as NodeType) ?? "activity";
                            updateNode(
                              nodeId,
                              defaultNodeForType(newType, nodeId),
                            );
                          }}
                          style={{ minWidth: 140 }}
                        />
                      </Group>
                      {node.type === "activity" && (
                        <ActivityNodeForm
                          node={node as ActivityNode}
                          onChange={(n) => updateNode(nodeId, n)}
                        />
                      )}
                      {node.type === "transform" && (
                        <TransformNodeForm
                          node={node as TransformNode}
                          onChange={(n) => updateNode(nodeId, n)}
                        />
                      )}
                    </Stack>
                  </Paper>
                );
              })}
              <Button
                variant="light"
                size="sm"
                leftSection={<IconPlus size={14} />}
                onClick={addNode}
              >
                Add node
              </Button>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="edges">
          <Accordion.Control>Edges</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              {value.edges.map((edge, index) => (
                <Paper key={edge.id} withBorder p="sm">
                  <Group gap="xs" wrap="wrap" align="flex-end">
                    <TextInput
                      label="ID"
                      value={edge.id}
                      onChange={(e) =>
                        updateEdge(index, {
                          ...edge,
                          id: e.currentTarget.value,
                        })
                      }
                      placeholder="edge id"
                      style={{ minWidth: 100 }}
                    />
                    <Select
                      label="Source"
                      data={nodeIds}
                      value={edge.source}
                      onChange={(v) =>
                        updateEdge(index, { ...edge, source: v ?? edge.source })
                      }
                      style={{ minWidth: 100 }}
                    />
                    <Select
                      label="Target"
                      data={nodeIds}
                      value={edge.target}
                      onChange={(v) =>
                        updateEdge(index, { ...edge, target: v ?? edge.target })
                      }
                      style={{ minWidth: 100 }}
                    />
                    <Select
                      label="Type"
                      data={EDGE_TYPES}
                      value={edge.type}
                      onChange={(v) =>
                        updateEdge(index, {
                          ...edge,
                          type: (v as GraphEdge["type"]) ?? "normal",
                        })
                      }
                      style={{ minWidth: 100 }}
                    />
                    <Button
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => removeEdge(index)}
                      leftSection={<IconTrash size={14} />}
                    >
                      Remove
                    </Button>
                  </Group>
                </Paper>
              ))}
              <Button
                variant="light"
                size="sm"
                leftSection={<IconPlus size={14} />}
                onClick={addEdge}
                disabled={nodeIds.length < 2}
              >
                Add edge
              </Button>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

interface TransformNodeFormProps {
  node: TransformNode;
  onChange: (node: TransformNode) => void;
}

/**
 * Configuration form for transform nodes. Provides format selectors,
 * a field mapping editor, upload/download helpers, and an optional XML
 * envelope editor (visible only when outputFormat is "xml").
 */
function TransformNodeForm({ node, onChange }: TransformNodeFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const envelopeFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        onChange({ ...node, fieldMapping: content });
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-uploaded
    e.target.value = "";
  };

  const handleDownload = () => {
    const blob = new Blob([node.fieldMapping], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mapping.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleEnvelopeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        onChange({
          ...node,
          xmlEnvelope: content || undefined,
        });
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-uploaded
    e.target.value = "";
  };

  const handleEnvelopeDownload = () => {
    const blob = new Blob([node.xmlEnvelope ?? ""], {
      type: "application/xml",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "envelope.xml";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="xs">
      <Group gap="sm" wrap="wrap">
        <Select
          label="Input format"
          data={[...FORMAT_OPTIONS]}
          value={node.inputFormat}
          onChange={(v) =>
            onChange({
              ...node,
              inputFormat: (v as TransformNode["inputFormat"]) ?? "json",
            })
          }
          style={{ minWidth: 120 }}
        />
        <Select
          label="Output format"
          data={[...FORMAT_OPTIONS]}
          value={node.outputFormat}
          onChange={(v) =>
            onChange({
              ...node,
              outputFormat: (v as TransformNode["outputFormat"]) ?? "json",
            })
          }
          style={{ minWidth: 120 }}
        />
      </Group>
      <Tooltip
        label="Use {{nodeName.fieldName}} to reference output fields from other nodes. Nested paths (e.g. {{nodeName.a.b}}) are supported."
        multiline
        w={320}
        position="top-start"
        withArrow
      >
        <Textarea
          label="Field mapping"
          description="JSON object mapping output keys to binding expressions (e.g. {{nodeName.fieldName}}). Invalid JSON is caught at execution time."
          placeholder='{\n  "outputKey": "{{nodeName.fieldName}}"\n}'
          value={node.fieldMapping}
          onChange={(e) =>
            onChange({ ...node, fieldMapping: e.currentTarget.value })
          }
          minRows={4}
          autosize
          styles={{ input: { fontFamily: "monospace" } }}
        />
      </Tooltip>
      <Group gap="xs">
        <Button
          variant="light"
          size="xs"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload mapping
        </Button>
        <Button
          variant="light"
          size="xs"
          onClick={handleDownload}
          disabled={!node.fieldMapping.trim()}
        >
          Download mapping
        </Button>
      </Group>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileUpload}
      />
      {node.outputFormat === "xml" && (
        <>
          <Textarea
            label="XML Envelope (optional)"
            description="Wrap the rendered XML payload in a caller-defined envelope. Use {{payload}} where the rendered XML should be injected."
            placeholder="<envelope>{{payload}}</envelope>"
            value={node.xmlEnvelope ?? ""}
            onChange={(e) => {
              const val = e.currentTarget.value;
              onChange({
                ...node,
                xmlEnvelope: val || undefined,
              });
            }}
            minRows={4}
            autosize
            styles={{ input: { fontFamily: "monospace" } }}
          />
          <Group gap="xs">
            <Button
              variant="light"
              size="xs"
              onClick={() => envelopeFileInputRef.current?.click()}
            >
              Upload envelope
            </Button>
            <Button
              variant="light"
              size="xs"
              onClick={handleEnvelopeDownload}
              disabled={!node.xmlEnvelope?.trim()}
            >
              Download envelope
            </Button>
          </Group>
          <input
            ref={envelopeFileInputRef}
            type="file"
            accept=".xml"
            style={{ display: "none" }}
            onChange={handleEnvelopeFileUpload}
          />
        </>
      )}
    </Stack>
  );
}

interface ActivityNodeFormProps {
  node: ActivityNode;
  onChange: (node: ActivityNode) => void;
}

function ActivityNodeForm({ node, onChange }: ActivityNodeFormProps) {
  const updateInputs = (inputs: PortBinding[]) => {
    onChange({ ...node, inputs });
  };
  const updateOutputs = (outputs: PortBinding[]) => {
    onChange({ ...node, outputs });
  };

  const addInput = () => {
    updateInputs([...(node.inputs ?? []), { port: "", ctxKey: "" }]);
  };
  const removeInput = (index: number) => {
    updateInputs((node.inputs ?? []).filter((_, i) => i !== index));
  };
  const updateInput = (index: number, binding: PortBinding) => {
    const inputs = [...(node.inputs ?? [])];
    inputs[index] = binding;
    updateInputs(inputs);
  };

  const addOutput = () => {
    updateOutputs([...(node.outputs ?? []), { port: "", ctxKey: "" }]);
  };
  const removeOutput = (index: number) => {
    updateOutputs((node.outputs ?? []).filter((_, i) => i !== index));
  };
  const updateOutput = (index: number, binding: PortBinding) => {
    const outputs = [...(node.outputs ?? [])];
    outputs[index] = binding;
    updateOutputs(outputs);
  };

  const isOcrEnrich = node.activityType === OCR_ENRICH_ACTIVITY_TYPE;
  const params = (node.parameters ?? {}) as Record<string, unknown>;
  const setParam = (key: string, value: unknown) => {
    onChange({
      ...node,
      parameters: { ...(node.parameters ?? {}), [key]: value },
    });
  };

  return (
    <Stack gap="xs">
      <TextInput
        label="Activity type"
        value={node.activityType}
        onChange={(e) =>
          onChange({ ...node, activityType: e.currentTarget.value })
        }
        placeholder="e.g. file.prepare"
      />
      {isOcrEnrich && (
        <Paper
          withBorder
          p="sm"
          style={{ background: "var(--mantine-color-default-hover)" }}
        >
          <Text size="sm" fw={600} mb="xs">
            Enrich results parameters
          </Text>
          <Stack gap="sm">
            <TextInput
              label="Document type (labeling project ID)"
              description="Labeling project ID used for field schema"
              value={(params.documentType as string) ?? ""}
              onChange={(e) =>
                setParam("documentType", e.currentTarget.value || undefined)
              }
              placeholder="Project UUID"
            />
            <NumberInput
              label="Confidence threshold"
              description="Fields below this are considered for enrichment (0–1, default 0.85)"
              value={
                params.confidenceThreshold !== undefined &&
                params.confidenceThreshold !== null
                  ? (params.confidenceThreshold as number)
                  : 0.85
              }
              onChange={(v) =>
                setParam(
                  "confidenceThreshold",
                  typeof v === "string" ? undefined : v,
                )
              }
              min={0}
              max={1}
              step={0.05}
              decimalScale={2}
              __clearable
            />
            <Switch
              label="Enable LLM enrichment"
              description="Use Azure OpenAI for low-confidence fields"
              checked={params.enableLlmEnrichment === true}
              onChange={(e) =>
                setParam("enableLlmEnrichment", e.currentTarget.checked)
              }
            />
          </Stack>
        </Paper>
      )}
      <Text size="sm" fw={500} c="dimmed">
        Inputs
      </Text>
      {(node.inputs ?? []).map((binding, i) => (
        <Group key={i} gap="xs">
          <TextInput
            placeholder="port"
            value={binding.port}
            onChange={(e) =>
              updateInput(i, { ...binding, port: e.currentTarget.value })
            }
            style={{ width: 100 }}
          />
          <TextInput
            placeholder="ctxKey"
            value={binding.ctxKey}
            onChange={(e) =>
              updateInput(i, { ...binding, ctxKey: e.currentTarget.value })
            }
            style={{ flex: 1 }}
          />
          <Button
            variant="subtle"
            color="red"
            size="xs"
            onClick={() => removeInput(i)}
          >
            <IconTrash size={12} />
          </Button>
        </Group>
      ))}
      <Button
        variant="subtle"
        size="xs"
        leftSection={<IconPlus size={12} />}
        onClick={addInput}
      >
        Add input
      </Button>
      <Text size="sm" fw={500} c="dimmed">
        Outputs
      </Text>
      {(node.outputs ?? []).map((binding, i) => (
        <Group key={i} gap="xs">
          <TextInput
            placeholder="port"
            value={binding.port}
            onChange={(e) =>
              updateOutput(i, { ...binding, port: e.currentTarget.value })
            }
            style={{ width: 100 }}
          />
          <TextInput
            placeholder="ctxKey"
            value={binding.ctxKey}
            onChange={(e) =>
              updateOutput(i, { ...binding, ctxKey: e.currentTarget.value })
            }
            style={{ flex: 1 }}
          />
          <Button
            variant="subtle"
            color="red"
            size="xs"
            onClick={() => removeOutput(i)}
          >
            <IconTrash size={12} />
          </Button>
        </Group>
      ))}
      <Button
        variant="subtle"
        size="xs"
        leftSection={<IconPlus size={12} />}
        onClick={addOutput}
      >
        Add output
      </Button>
    </Stack>
  );
}
