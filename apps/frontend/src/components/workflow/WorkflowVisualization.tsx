import { Paper, Stack, Text, Title } from "@mantine/core";
import { useMemo, useRef } from "react";

interface WorkflowStepConfig {
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

interface WorkflowConfig {
  steps: {
    updateStatus?: WorkflowStepConfig;
    prepareFileData?: WorkflowStepConfig;
    submitToAzureOCR?: WorkflowStepConfig;
    updateApimRequestId?: WorkflowStepConfig;
    waitBeforePoll?: WorkflowStepConfig;
    pollOCRResults?: WorkflowStepConfig;
    extractOCRResults?: WorkflowStepConfig;
    postOcrCleanup?: WorkflowStepConfig;
    checkOcrConfidence?: WorkflowStepConfig;
    humanReview?: WorkflowStepConfig;
    storeResults?: WorkflowStepConfig;
  };
}

interface WorkflowVisualizationProps {
  config: WorkflowConfig;
}

interface Node {
  id: string;
  label: string;
  enabled: boolean;
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
}

// Define workflow step dependencies
const WORKFLOW_EDGES: Edge[] = [
  { from: "updateStatus", to: "prepareFileData" },
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  { from: "prepareFileData", to: "submitToAzureOCR" },
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  { from: "submitToAzureOCR", to: "updateApimRequestId" },
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  { from: "updateApimRequestId", to: "waitBeforePoll" },
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  { from: "waitBeforePoll", to: "pollOCRResults" },
  { from: "pollOCRResults", to: "extractOCRResults" },
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  { from: "extractOCRResults", to: "postOcrCleanup" },
  // biome-ignore lint/security/noSecrets: These are workflow step identifiers, not secrets
  { from: "postOcrCleanup", to: "checkOcrConfidence" },
  { from: "checkOcrConfidence", to: "storeResults" },
  { from: "checkOcrConfidence", to: "humanReview" },
  { from: "humanReview", to: "storeResults" },
];

// Step labels for display
const STEP_LABELS: Record<string, string> = {
  updateStatus: "Update Status",
  prepareFileData: "Prepare File",
  submitToAzureOCR: "Submit OCR",
  updateApimRequestId: "Update Request ID",
  waitBeforePoll: "Wait",
  pollOCRResults: "Poll Results",
  extractOCRResults: "Extract Results",
  postOcrCleanup: "Cleanup",
  checkOcrConfidence: "Check Confidence",
  humanReview: "Human Review",
  storeResults: "Store Results",
};

export function WorkflowVisualization({ config }: WorkflowVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fixed viewBox dimensions - this is our coordinate system
  const viewBoxWidth = 400;
  const viewBoxHeight = 580;
  const padding = 20;
  const nodeWidth = 140;
  const mainColumnX = padding;
  const rightColumnX = viewBoxWidth - nodeWidth - padding;

  const nodes = useMemo(() => {
    const nodeList: Node[] = [];

    const nodePositions: Record<string, { x: number; y: number }> = {
      updateStatus: { x: mainColumnX, y: 20 },
      prepareFileData: { x: mainColumnX, y: 70 },
      submitToAzureOCR: { x: mainColumnX, y: 120 },
      updateApimRequestId: { x: mainColumnX, y: 170 },
      waitBeforePoll: { x: mainColumnX, y: 220 },
      pollOCRResults: { x: mainColumnX, y: 270 },
      extractOCRResults: { x: mainColumnX, y: 320 },
      postOcrCleanup: { x: mainColumnX, y: 370 },
      checkOcrConfidence: { x: mainColumnX, y: 420 },
      humanReview: { x: rightColumnX, y: 470 },
      storeResults: { x: mainColumnX, y: 520 },
    };

    Object.keys(STEP_LABELS).forEach((stepId) => {
      const stepConfig = config.steps[stepId as keyof typeof config.steps];
      const enabled = stepConfig?.enabled !== false;
      const position = nodePositions[stepId];
      if (position) {
        nodeList.push({
          id: stepId,
          label: STEP_LABELS[stepId],
          enabled,
          x: position.x,
          y: position.y,
        });
      }
    });

    return nodeList;
  }, [config]);

  const edges = useMemo(() => {
    return WORKFLOW_EDGES.filter((edge) => {
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      return fromNode && toNode;
    });
  }, [nodes]);

  return (
    <Paper shadow="sm" radius="md" p="md" withBorder>
      <Stack gap="xs">
        <Title order={4}>Workflow Visualization</Title>
        <div ref={containerRef} style={{ width: "100%", padding: "20px" }}>
          <svg
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: "4px",
              display: "block",
              width: "100%",
              height: "auto",
            }}
            viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
            preserveAspectRatio="xMinYMin meet"
          >
            {/* Draw edges */}
            {edges.map((edge, idx) => {
              const fromNode = nodes.find((n) => n.id === edge.from);
              const toNode = nodes.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              const fromEnabled = fromNode.enabled;
              const toEnabled = toNode.enabled;
              const edgeEnabled = fromEnabled && toEnabled;

              // Handle conditional path (humanReview branch)
              const isConditionalPath =
                edge.from === "checkOcrConfidence" && edge.to === "humanReview";
              const isHumanReviewToStore =
                edge.from === "humanReview" && edge.to === "storeResults";

              if (isConditionalPath) {
                // Curved path for conditional branch
                const startX = fromNode.x + 70;
                const startY = fromNode.y + 28;
                const endX = toNode.x + 70;
                const endY = toNode.y + 12;
                const controlX = (startX + endX) / 2 + 50;
                const controlY = (startY + endY) / 2;

                return (
                  <path
                    key={`edge-${idx}`}
                    d={`M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`}
                    fill="none"
                    stroke={edgeEnabled ? "#ff9800" : "#ccc"}
                    strokeWidth={edgeEnabled ? 2 : 1}
                    strokeDasharray={edgeEnabled ? "0" : "5,5"}
                    markerEnd="url(#arrowhead-conditional)"
                  />
                );
              } else if (isHumanReviewToStore) {
                // Path from humanReview (right side) back to storeResults (left side)
                const startX = fromNode.x + 70;
                const startY = fromNode.y + 28;
                const endX = toNode.x + 70;
                const endY = toNode.y + 12;
                const controlX = (startX + endX) / 2 - 50;
                const controlY = (startY + endY) / 2;

                return (
                  <path
                    key={`edge-${idx}`}
                    d={`M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`}
                    fill="none"
                    stroke={edgeEnabled ? "#ff9800" : "#ccc"}
                    strokeWidth={edgeEnabled ? 2 : 1}
                    strokeDasharray={edgeEnabled ? "0" : "5,5"}
                    markerEnd="url(#arrowhead-conditional)"
                  />
                );
              } else {
                // Straight path for linear flow
                return (
                  <line
                    key={`edge-${idx}`}
                    x1={fromNode.x + 70}
                    y1={fromNode.y + 28}
                    x2={toNode.x + 70}
                    y2={toNode.y + 12}
                    stroke={edgeEnabled ? "#4caf50" : "#ccc"}
                    strokeWidth={edgeEnabled ? 2 : 1}
                    strokeDasharray={edgeEnabled ? "0" : "5,5"}
                    markerEnd="url(#arrowhead)"
                  />
                );
              }
            })}

            {/* Arrow marker definitions */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#4caf50" opacity="0.6" />
              </marker>
              <marker
                id="arrowhead-conditional"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#ff9800" opacity="0.6" />
              </marker>
            </defs>

            {/* Draw nodes */}
            {nodes.map((node) => (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width="140"
                  height="28"
                  rx="4"
                  fill={node.enabled ? "#e8f5e9" : "#f5f5f5"}
                  stroke={node.enabled ? "#4caf50" : "#ccc"}
                  strokeWidth={node.enabled ? 2 : 1}
                />
                <text
                  x={node.x + 70}
                  y={node.y + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill={node.enabled ? "#2e7d32" : "#666"}
                  fontWeight={node.enabled ? "600" : "400"}
                >
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <Stack gap={4} mt="xs">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                backgroundColor: "#e8f5e9",
                border: "2px solid #4caf50",
              }}
            />
            <Text size="xs" c="dimmed">
              Enabled
            </Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                backgroundColor: "#f5f5f5",
                border: "1px solid #ccc",
              }}
            />
            <Text size="xs" c="dimmed">
              Disabled
            </Text>
          </div>
        </Stack>
      </Stack>
    </Paper>
  );
}
