/**
 * OCR Improvement Pipeline Service
 *
 * Orchestrates candidate workflow generation from HITL corrections:
 * 1. Aggregate HITL corrections
 * 2. Get tool manifest
 * 3. Run AI recommendation
 * 4. Apply recommendations to create candidate workflow
 *
 * The caller (controller) is responsible for starting a benchmark run
 * against the candidate workflow version returned by generate().
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  ActivityNode,
  GraphWorkflowConfig,
} from "@/workflow/graph-workflow-types";
import {
  buildInsertionSlots,
  findSlotImmediatelyAfterAzureOcrExtract,
  resolveRecommendationsInsertionSlots,
} from "@/workflow/insertion-slots.util";
import {
  applyOcrNormalizeFieldsEmptyValueCoercion,
  applyRecommendations,
  type OcrNormalizeFieldsEmptyValueCoercion,
  type ToolRecommendation,
} from "@/workflow/workflow-modification.util";
import type { HitlAggregationFilters } from "../hitl/hitl-aggregation.service";
import { HitlAggregationService } from "../hitl/hitl-aggregation.service";
import { ToolManifestService } from "../hitl/tool-manifest.service";
import { WorkflowService } from "../workflow/workflow.service";
import { AiRecommendationService } from "./ai-recommendation.service";

export interface GenerateInput {
  workflowVersionId: string;
  actorId: string;
  hitlFilters?: HitlAggregationFilters;
  normalizeFieldsEmptyValueCoercion?: OcrNormalizeFieldsEmptyValueCoercion;
}

export interface GenerateResult {
  candidateWorkflowVersionId: string;
  candidateLineageId: string;
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };
  analysis?: string;
  pipelineMessage?: string;
  rejectionDetails?: string[];
  status: "candidate_created" | "no_recommendations" | "error";
  error?: string;
}

@Injectable()
export class OcrImprovementPipelineService {
  private readonly logger = new Logger(OcrImprovementPipelineService.name);

  constructor(
    private readonly hitlAggregation: HitlAggregationService,
    private readonly toolManifest: ToolManifestService,
    private readonly aiRecommendation: AiRecommendationService,
    private readonly workflowService: WorkflowService,
  ) {}

  /**
   * Generate a candidate workflow version from HITL corrections and AI recommendations.
   *
   * Runs steps 1-4 of the pipeline (HITL aggregation → AI recommendation → create candidate).
   * Does NOT start a benchmark run.
   */
  async generate(input: GenerateInput): Promise<GenerateResult> {
    this.logger.log(
      `Generating candidate workflow for workflow version ${input.workflowVersionId}`,
    );

    try {
      // Step 1: Aggregate HITL corrections
      const { corrections } =
        await this.hitlAggregation.getAggregatedCorrections(
          input.hitlFilters ?? {},
        );

      if (corrections.length === 0) {
        return {
          candidateWorkflowVersionId: "",
          candidateLineageId: "",
          recommendationsSummary: {
            applied: 0,
            rejected: 0,
            toolIds: [],
          },
          pipelineMessage:
            "No HITL corrections matched the aggregation filters; nothing to recommend.",
          status: "no_recommendations",
        };
      }

      // Step 2: Get tool manifest
      const manifest = this.toolManifest.getManifest();

      // Step 3: Build AI input for AiRecommendationService
      const correctionInput = corrections.map((c) => ({
        fieldKey: c.fieldKey,
        originalValue: c.originalValue,
        correctedValue: c.correctedValue,
        action: c.action,
      }));

      const toolInput = manifest.map((t) => ({
        toolId: t.toolId,
        label: t.label,
        description: t.description,
        parameters: t.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          description: p.description,
          required: p.required,
          default: p.default,
        })),
      }));

      // Step 4: Load current workflow and build summary
      const currentWorkflow = await this.workflowService.getWorkflowById(
        input.workflowVersionId,
      );
      if (!currentWorkflow) {
        return {
          candidateWorkflowVersionId: "",
          candidateLineageId: "",
          recommendationsSummary: {
            applied: 0,
            rejected: 0,
            toolIds: [],
          },
          status: "error",
          error: `Workflow version ${input.workflowVersionId} not found`,
        };
      }

      const config = currentWorkflow.config as GraphWorkflowConfig;
      const insertionSlots = buildInsertionSlots(config, {
        postAzureOcrExtractOnly: true,
      });
      const workflowSummary = {
        nodeIds: Object.keys(config.nodes),
        activityTypes: Object.values(config.nodes)
          .filter((n): n is ActivityNode => n.type === "activity")
          .map((n) => n.activityType),
        edgeSummary: config.edges.map((e) => `${e.source} -> ${e.target}`),
        activityNodes: Object.entries(config.nodes)
          .filter(([, n]) => n.type === "activity")
          .map(([nodeId, n]) => ({
            nodeId,
            activityType: (n as ActivityNode).activityType,
          })),
        insertionSlots: insertionSlots.map((s) => ({
          slotIndex: s.slotIndex,
          afterNodeId: s.afterNodeId,
          beforeNodeId: s.beforeNodeId,
          afterActivityType: s.afterActivityType,
          beforeActivityType: s.beforeActivityType,
        })),
      };

      this.logger.log(
        `Pipeline prepared: ${correctionInput.length} corrections, ${toolInput.length} tools, ${workflowSummary.nodeIds.length} nodes, ${insertionSlots.length} insertion slots`,
      );

      // Step 5: Run AI recommendation
      const aiOutput = await this.aiRecommendation.getRecommendations(
        {
          corrections: correctionInput,
          availableTools: toolInput,
          currentWorkflowSummary: workflowSummary,
        },
        manifest.map((t) => t.toolId),
      );

      if (aiOutput.recommendations.length === 0) {
        return {
          candidateWorkflowVersionId: "",
          candidateLineageId: "",
          recommendationsSummary: {
            applied: 0,
            rejected: 0,
            toolIds: [],
          },
          analysis: aiOutput.analysis,
          pipelineMessage:
            "The model returned analysis but no structured tool recommendations (or every tool id was invalid). Check backend logs for rejected tool ids.",
          status: "no_recommendations",
        };
      }

      const pipelineSlot =
        findSlotImmediatelyAfterAzureOcrExtract(insertionSlots);
      if (!pipelineSlot) {
        return {
          candidateWorkflowVersionId: "",
          candidateLineageId: "",
          recommendationsSummary: {
            applied: 0,
            rejected: 0,
            toolIds: [],
          },
          analysis: aiOutput.analysis,
          pipelineMessage:
            "No insertion edge after azureOcr.extract; cannot apply correction tools.",
          status: "no_recommendations",
        };
      }

      const recommendationsWithInsertion = aiOutput.recommendations.map(
        (r) => ({
          toolId: r.toolId,
          parameters: r.parameters,
          rationale: r.rationale,
          priority: r.priority,
          insertionPoint: {
            afterNodeId: pipelineSlot.afterNodeId,
            beforeNodeId: pipelineSlot.beforeNodeId,
          },
        }),
      );

      const resolvedRecommendations = resolveRecommendationsInsertionSlots(
        recommendationsWithInsertion,
        insertionSlots,
      );
      const recommendationsForApply: ToolRecommendation[] =
        resolvedRecommendations.map((r) => ({
          toolId: r.toolId,
          parameters: r.parameters,
          insertionPoint: r.insertionPoint,
          rationale: r.rationale,
          priority: r.priority,
        }));

      // Step 6: Apply recommendations to get candidate config
      const modification = applyRecommendations(
        config,
        recommendationsForApply,
      );

      if (modification.appliedRecommendations.length === 0) {
        modification.rejectedRecommendations.forEach(
          ({ recommendation, reason }) => {
            this.logger.debug(
              `Recommendation rejected: toolId=${recommendation.toolId} afterNodeId=${recommendation.insertionPoint.afterNodeId} beforeNodeId=${recommendation.insertionPoint.beforeNodeId} reason=${reason}`,
            );
          },
        );
        this.logger.debug(
          `Workflow node IDs: ${Object.keys(config.nodes).join(", ")}`,
        );
        return {
          candidateWorkflowVersionId: "",
          candidateLineageId: "",
          recommendationsSummary: {
            applied: 0,
            rejected: modification.rejectedRecommendations.length,
            toolIds: [],
          },
          analysis: aiOutput.analysis,
          pipelineMessage:
            "Recommendations could not be inserted into the workflow graph (wrong node ids or missing edges).",
          rejectionDetails: modification.rejectedRecommendations.map(
            ({ recommendation, reason }) =>
              `${recommendation.toolId}: ${reason}`,
          ),
          status: "no_recommendations",
        };
      }

      const candidateConfig =
        input.normalizeFieldsEmptyValueCoercion != null
          ? applyOcrNormalizeFieldsEmptyValueCoercion(
              modification.newConfig,
              input.normalizeFieldsEmptyValueCoercion,
            )
          : modification.newConfig;

      // Step 7: Create candidate workflow
      const candidate = await this.workflowService.createCandidateVersion(
        input.workflowVersionId,
        candidateConfig,
        input.actorId,
      );

      return {
        status: "candidate_created",
        candidateWorkflowVersionId: candidate.workflowVersionId,
        candidateLineageId: candidate.id,
        recommendationsSummary: {
          applied: modification.appliedRecommendations.length,
          rejected: modification.rejectedRecommendations.length,
          toolIds: modification.appliedRecommendations.map((r) => r.toolId),
        },
        analysis: aiOutput.analysis,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`OCR improvement pipeline generate failed: ${message}`);
      return {
        candidateWorkflowVersionId: "",
        candidateLineageId: "",
        recommendationsSummary: {
          applied: 0,
          rejected: 0,
          toolIds: [],
        },
        status: "error",
        error: message,
      };
    }
  }
}
