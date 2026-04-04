/**
 * OCR Improvement Pipeline Service
 *
 * Orchestrates the end-to-end OCR correction pipeline:
 * 1. Aggregate HITL corrections
 * 2. Get tool manifest
 * 3. Run AI recommendation
 * 4. Apply recommendations to create candidate workflow
 * 5. Start benchmark run with candidate workflow
 * 6. Optionally wait for run completion and read baseline comparison (US-013)
 * 7. Return candidate and run IDs (and comparison when waited)
 *
 * Feature 008A will add conditional replacement and looping.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-04-benchmark-integration-workflow-comparison.md
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
import { BenchmarkRunService } from "./benchmark-run.service";
import type { BaselineComparison } from "./dto/promote-baseline.dto";
import type { RunDetailsDto } from "./dto/run-response.dto";

const DEFAULT_PIPELINE_POLL_MS = 5000;
const DEFAULT_PIPELINE_WAIT_TIMEOUT_MS = 60 * 60 * 1000;

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

export interface PipelineInput {
  /** Pinned workflow version ID (WorkflowVersion.id) to create a candidate from. */
  workflowVersionId: string;
  /** Benchmark definition ID to run the candidate against. */
  benchmarkDefinitionId: string;
  /** Benchmark project ID. */
  benchmarkProjectId: string;
  /** Filters for HITL correction aggregation. */
  hitlFilters?: HitlAggregationFilters;
  /** Actor ID for workflow lineage ownership (resolves to User for persistence). */
  actorId: string;
  /** Poll until candidate run completes and return baseline comparison. */
  waitForPipelineRunCompletion?: boolean;
  pipelineRunPollIntervalMs?: number;
  pipelineRunWaitTimeoutMs?: number;
  /**
   * When set, every `ocr.normalizeFields` node in the candidate workflow gets this
   * `emptyValueCoercion` (overrides the definition graph and any AI-suggested value).
   */
  normalizeFieldsEmptyValueCoercion?: OcrNormalizeFieldsEmptyValueCoercion;
}

export interface PipelineResult {
  /** Head workflow version ID of the candidate lineage (WorkflowVersion.id). */
  candidateWorkflowVersionId: string;
  /** ID of the benchmark run started. */
  benchmarkRunId: string;
  /** Summary of recommendations applied. */
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };
  /** AI analysis summary when available. */
  analysis?: string;
  /**
   * When status is no_recommendations: why nothing was applied (distinct from error).
   */
  pipelineMessage?: string;
  /** Per-recommendation rejection reasons when AI returned tools but graph apply failed. */
  rejectionDetails?: string[];
  /** Status of the pipeline. */
  status:
    | "benchmark_started"
    | "benchmark_completed"
    | "benchmark_failed"
    | "benchmark_cancelled"
    | "benchmark_wait_timeout"
    | "no_recommendations"
    | "error";
  /** Error message if status is "error". */
  error?: string;
  benchmarkRunStatus?: string;
  baselineComparison?: BaselineComparison | null;
}

@Injectable()
export class OcrImprovementPipelineService {
  private readonly logger = new Logger(OcrImprovementPipelineService.name);

  constructor(
    private readonly hitlAggregation: HitlAggregationService,
    private readonly toolManifest: ToolManifestService,
    private readonly aiRecommendation: AiRecommendationService,
    private readonly workflowService: WorkflowService,
    private readonly benchmarkRunService: BenchmarkRunService,
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Poll until the benchmark run leaves pending/running or timeout.
   */
  private async pollUntilTerminalRun(
    projectId: string,
    runId: string,
    pollIntervalMs: number,
    timeoutMs: number,
  ): Promise<
    | { timedOut: false; run: RunDetailsDto }
    | { timedOut: true; lastRun: RunDetailsDto }
  > {
    const deadline = Date.now() + timeoutMs;
    let lastRun = await this.benchmarkRunService.getRunById(projectId, runId);
    while (Date.now() < deadline) {
      if (
        lastRun.status === "completed" ||
        lastRun.status === "failed" ||
        lastRun.status === "cancelled"
      ) {
        return { timedOut: false as const, run: lastRun };
      }
      await this.sleep(pollIntervalMs);
      lastRun = await this.benchmarkRunService.getRunById(projectId, runId);
    }
    return { timedOut: true as const, lastRun };
  }

  /**
   * Generate a candidate workflow version from HITL corrections and AI recommendations.
   *
   * Runs steps 1-7 of the pipeline (HITL aggregation → AI recommendation → create candidate).
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

  /**
   * Run the OCR improvement pipeline end-to-end.
   *
   * This method orchestrates the full pipeline synchronously up to starting
   * the benchmark run. The benchmark run itself is asynchronous (Temporal workflow).
   * Poll the benchmark run status separately.
   */
  async run(input: PipelineInput): Promise<PipelineResult> {
    this.logger.log(
      `Starting OCR improvement pipeline for workflow version ${input.workflowVersionId}`,
    );

    try {
      const generateResult = await this.generate({
        workflowVersionId: input.workflowVersionId,
        actorId: input.actorId,
        hitlFilters: input.hitlFilters,
        normalizeFieldsEmptyValueCoercion:
          input.normalizeFieldsEmptyValueCoercion,
      });

      if (generateResult.status !== "candidate_created") {
        return {
          candidateWorkflowVersionId: generateResult.candidateWorkflowVersionId,
          benchmarkRunId: "",
          recommendationsSummary: generateResult.recommendationsSummary,
          analysis: generateResult.analysis,
          pipelineMessage: generateResult.pipelineMessage,
          rejectionDetails: generateResult.rejectionDetails,
          status:
            generateResult.status === "error" ? "error" : "no_recommendations",
          error: generateResult.error,
        };
      }

      // Re-load the candidate config for the benchmark run
      const currentWorkflow = await this.workflowService.getWorkflowById(
        generateResult.candidateWorkflowVersionId,
      );
      if (!currentWorkflow) {
        return {
          candidateWorkflowVersionId: "",
          benchmarkRunId: "",
          recommendationsSummary: generateResult.recommendationsSummary,
          status: "error",
          error: `Candidate workflow version ${generateResult.candidateWorkflowVersionId} not found after creation`,
        };
      }

      const candidateConfig = currentWorkflow.config as GraphWorkflowConfig;

      // Step 8: Start benchmark run with workflow override (replay OCR from baseline cache when available)
      const baselineForOcrCache =
        await this.benchmarkRunService.getLatestCompletedBaselineRunId(
          input.benchmarkProjectId,
          input.benchmarkDefinitionId,
        );

      const runDetails = await this.benchmarkRunService.startRun(
        input.benchmarkProjectId,
        input.benchmarkDefinitionId,
        {
          workflowConfigOverride: candidateConfig as unknown as Record<
            string,
            unknown
          >,
          candidateWorkflowVersionId: generateResult.candidateWorkflowVersionId,
          ...(baselineForOcrCache
            ? { ocrCacheBaselineRunId: baselineForOcrCache }
            : {}),
        },
      );

      const pollInterval =
        input.pipelineRunPollIntervalMs ?? DEFAULT_PIPELINE_POLL_MS;
      const waitTimeout =
        input.pipelineRunWaitTimeoutMs ?? DEFAULT_PIPELINE_WAIT_TIMEOUT_MS;

      if (!input.waitForPipelineRunCompletion) {
        return {
          candidateWorkflowVersionId: generateResult.candidateWorkflowVersionId,
          benchmarkRunId: runDetails.id,
          recommendationsSummary: generateResult.recommendationsSummary,
          analysis: generateResult.analysis,
          status: "benchmark_started",
          benchmarkRunStatus: runDetails.status,
        };
      }

      const waited = await this.pollUntilTerminalRun(
        input.benchmarkProjectId,
        runDetails.id,
        pollInterval,
        waitTimeout,
      );

      if (waited.timedOut === true) {
        return {
          candidateWorkflowVersionId: generateResult.candidateWorkflowVersionId,
          benchmarkRunId: runDetails.id,
          recommendationsSummary: generateResult.recommendationsSummary,
          analysis: generateResult.analysis,
          status: "benchmark_wait_timeout",
          error: `Timed out after ${waitTimeout}ms waiting for benchmark run ${runDetails.id} (last status: ${waited.lastRun.status})`,
          benchmarkRunStatus: waited.lastRun.status,
          baselineComparison: waited.lastRun.baselineComparison,
        };
      }

      const terminal = waited.run;
      const terminalStatus =
        terminal.status === "completed"
          ? "benchmark_completed"
          : terminal.status === "failed"
            ? "benchmark_failed"
            : "benchmark_cancelled";

      return {
        candidateWorkflowVersionId: generateResult.candidateWorkflowVersionId,
        benchmarkRunId: runDetails.id,
        recommendationsSummary: generateResult.recommendationsSummary,
        analysis: generateResult.analysis,
        status: terminalStatus,
        benchmarkRunStatus: terminal.status,
        baselineComparison: terminal.baselineComparison,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`OCR improvement pipeline failed: ${message}`);
      return {
        candidateWorkflowVersionId: "",
        benchmarkRunId: "",
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
