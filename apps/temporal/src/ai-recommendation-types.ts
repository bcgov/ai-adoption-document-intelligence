/**
 * Types for the AI tool recommendation pipeline.
 *
 * The AI analyzes HITL correction patterns and recommends which OCR
 * correction tools to add to a workflow graph.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-03-ai-hitl-processing-tool-selection.md
 */

export interface HitlCorrectionInput {
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
  action: string;
  count?: number;
}

export interface ToolManifestInput {
  toolId: string;
  label: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: unknown;
  }>;
}

export interface ActivityNodeSummary {
  nodeId: string;
  activityType: string;
}

export interface InsertionSlotSummary {
  slotIndex: number;
  afterNodeId: string;
  beforeNodeId: string;
  afterActivityType: string | null;
  beforeActivityType: string | null;
}

export interface WorkflowSummaryInput {
  nodeIds: string[];
  activityTypes: string[];
  edgeSummary: string[];
  activityNodes?: ActivityNodeSummary[];
  insertionSlots?: InsertionSlotSummary[];
}

export interface ToolRecommendation {
  toolId: string;
  parameters: Record<string, unknown>;
  insertionPoint: {
    afterNodeId?: string;
    beforeNodeId?: string;
  };
  insertionSlotIndex?: number;
  afterActivityType?: string;
  beforeActivityType?: string;
  rationale: string;
  priority: number;
}

export interface AiRecommendationInput {
  corrections: HitlCorrectionInput[];
  availableTools: ToolManifestInput[];
  currentWorkflowSummary: WorkflowSummaryInput;
}

export interface AiRecommendationOutput {
  recommendations: ToolRecommendation[];
  analysis: string;
}
