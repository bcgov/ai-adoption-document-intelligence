/**
 * AI Recommendation Service
 *
 * Calls Azure OpenAI to analyze HITL correction patterns and recommend
 * OCR correction tools; recommendations are applied via workflow modification utilities.
 * The model only chooses which of three tools to include and parameters;
 * insertion is always on the first edge after structured OCR
 * (e.g. `azureOcr.extract`, `mistralOcr.process`; see `@ai-di/graph-insertion-slots`).
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-03-ai-hitl-processing-tool-selection.md
 */

import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { findSlotImmediatelyAfterAzureOcrExtract } from "@/workflow/insertion-slots.util";

const DEFAULT_API_VERSION = "2024-12-01-preview";

/** Max corrections embedded in the user prompt (token control); remainder are omitted. */
const MAX_CORRECTIONS_IN_PROMPT = 200;

const OCR_AI_CORRECTION_TOOL_ORDER = [
  "ocr.characterConfusion",
  "ocr.spellcheck",
] as const;

const MODEL_JSON_KEYS = ["characterConfusion", "spellcheck"] as const;

const KEY_TO_TOOL_ID: Record<
  (typeof MODEL_JSON_KEYS)[number],
  (typeof OCR_AI_CORRECTION_TOOL_ORDER)[number]
> = {
  characterConfusion: "ocr.characterConfusion",
  spellcheck: "ocr.spellcheck",
};

export interface HitlCorrectionInput {
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
  action: string;
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

export interface ConfusionProfileSummary {
  id: string;
  name: string;
  description?: string | null;
  topConfusions: Array<{
    trueChar: string;
    recognizedChar: string;
    count: number;
  }>;
}

export interface AiRecommendationInput {
  corrections: HitlCorrectionInput[];
  availableTools: ToolManifestInput[];
  currentWorkflowSummary: WorkflowSummaryInput;
  availableConfusionProfiles?: ConfusionProfileSummary[];
}

/** Tool choices and parameters only; insertion is applied in the improvement pipeline (first edge after structured OCR output). */
export interface ToolRecommendationOutput {
  toolId: string;
  parameters: Record<string, unknown>;
  rationale: string;
  priority: number;
}

/** Single entry in the pipeline debug log. */
export interface PipelineLogEntry {
  /** Pipeline step identifier */
  step: string;
  /** ISO 8601 timestamp when the step started */
  timestamp: string;
  /** How long the step took in milliseconds */
  durationMs?: number;
  /** Step-specific payload */
  data: Record<string, unknown>;
}

export interface AiRecommendationOutput {
  recommendations: ToolRecommendationOutput[];
  analysis: string;
  /** Debug log entries for the LLM call: prompt_build, llm_request, llm_response */
  debugInfo?: PipelineLogEntry[];
}

function buildSystemMessage(): string {
  return `You are an expert at analyzing OCR error patterns from HITL corrections.

You must respond with valid JSON only. Do not use markdown code fences or any text outside the JSON.`;
}

function filterManifestToOrderedCorrectionTools(
  manifest: AiRecommendationInput["availableTools"],
): AiRecommendationInput["availableTools"] {
  const byId = new Map(manifest.map((t) => [t.toolId, t]));
  return OCR_AI_CORRECTION_TOOL_ORDER.map((id) => byId.get(id)).filter(
    (t): t is NonNullable<typeof t> => t != null,
  );
}

/** Fields passed to the model only; insertion is server-controlled (see findSlotImmediatelyAfterAzureOcrExtract). */
function toolsForPrompt(tools: AiRecommendationInput["availableTools"]): Array<{
  toolId: string;
  label: string;
  description: string;
  parameters: ToolManifestInput["parameters"];
}> {
  return tools.map(({ toolId, label, description, parameters }) => ({
    toolId,
    label,
    description,
    parameters,
  }));
}

function buildUserMessage(input: AiRecommendationInput): string {
  const correctionsSample = input.corrections.slice(
    0,
    MAX_CORRECTIONS_IN_PROMPT,
  );
  const tools = filterManifestToOrderedCorrectionTools(input.availableTools);
  const toolsJson = JSON.stringify(toolsForPrompt(tools), null, 2);
  const correctionsJson = JSON.stringify(correctionsSample, null, 2);
  const workflowJson = JSON.stringify(
    {
      activityNodes: input.currentWorkflowSummary.activityNodes ?? [],
      edgeSummary: input.currentWorkflowSummary.edgeSummary ?? [],
    },
    null,
    2,
  );

  const profilesSection =
    input.availableConfusionProfiles &&
    input.availableConfusionProfiles.length > 0
      ? `\nAvailable confusion profiles (use confusionProfileId from this list for ocr.characterConfusion):\n${JSON.stringify(
          input.availableConfusionProfiles,
          null,
          2,
        )}\n`
      : "\nNo confusion profiles available; omit confusionProfileId or leave ocr.characterConfusion disabled.\n";

  const keyLines = MODEL_JSON_KEYS.map(
    (k) =>
      `    "${k}": { "include": <true|false>, "parameters": { }, "rationale": "<optional short reason>" }`,
  ).join(",\n");

  return `HITL corrections (${input.corrections.length} total, up to ${MAX_CORRECTIONS_IN_PROMPT} shown):
${correctionsJson}

OCR correction tools (only these may be enabled; pipeline order is fixed: character confusion, then spellcheck — you only choose include/parameters):
${toolsJson}
${profilesSection}
Workflow context (match documentType to the LabelingProject id used by ocr.enrich when present):
${workflowJson}

Insertion: the server places enabled tools on the first normal edge after structured OCR (e.g. azureOcr.extract or mistralOcr.process) in a fixed order; you do not choose graph position.

Respond with one JSON object:
{
  "analysis": "<brief patterns you observed>",
${keyLines}
}

Rules:
- Only the two keys above (plus "analysis"). Set "include": true only when the data supports that tool.
- "parameters" must use names and types from each tool's manifest.
- For ocr.characterConfusion: set confusionProfileId to the id of a matching profile from the available list; set documentType to the LabelingProject id used by ocr.enrich when applicable. Do not reference built-in rule IDs.
- For ocr.spellcheck: set language and fieldScope as needed.
- Omit a tool or set "include": false when not needed.
- Ignore any notion of per-tool insertion or "safe" graph positions; placement is not configurable in your output.`;
}

function parseToolBlock(v: unknown): {
  include: boolean;
  parameters: Record<string, unknown>;
  rationale: string;
} {
  if (v === null || v === undefined || typeof v !== "object") {
    return { include: false, parameters: {}, rationale: "" };
  }
  const o = v as Record<string, unknown>;
  const include = o.include === true;
  const parameters =
    typeof o.parameters === "object" && o.parameters !== null
      ? (o.parameters as Record<string, unknown>)
      : {};
  const rationale = typeof o.rationale === "string" ? o.rationale : "";
  return { include, parameters, rationale };
}

function emptyParsedByKey(): Record<string, ReturnType<typeof parseToolBlock>> {
  const byKey: Record<string, ReturnType<typeof parseToolBlock>> = {};
  for (const key of MODEL_JSON_KEYS) {
    byKey[key] = parseToolBlock(undefined);
  }
  return byKey;
}

function parseRecommendationResponse(content: string): {
  analysis: string;
  byKey: Record<string, ReturnType<typeof parseToolBlock>>;
  jsonParseFailed: boolean;
} {
  let raw = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = raw.match(fence);
  if (match) raw = match[1].trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { analysis: "", byKey: emptyParsedByKey(), jsonParseFailed: true };
  }

  const analysis = typeof parsed.analysis === "string" ? parsed.analysis : "";

  const byKey: Record<string, ReturnType<typeof parseToolBlock>> = {};
  for (const key of MODEL_JSON_KEYS) {
    byKey[key] = parseToolBlock(parsed[key]);
  }

  return { analysis, byKey, jsonParseFailed: false };
}

function buildRecommendationsFromModel(
  parsed: ReturnType<typeof parseRecommendationResponse>,
  allowedIds: Set<string>,
): ToolRecommendationOutput[] {
  const out: ToolRecommendationOutput[] = [];
  let priority = 1;
  for (const key of MODEL_JSON_KEYS) {
    const toolId = KEY_TO_TOOL_ID[key];
    if (!allowedIds.has(toolId)) continue;
    const block = parsed.byKey[key];
    if (!block.include) continue;
    out.push({
      toolId,
      parameters: block.parameters,
      rationale: block.rationale || `Recommended ${toolId}`,
      priority,
    });
    priority += 1;
  }
  return out;
}

@Injectable()
export class AiRecommendationService {
  private readonly logger = new Logger(AiRecommendationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getRecommendations(
    input: AiRecommendationInput,
    validToolIds?: string[],
  ): Promise<AiRecommendationOutput> {
    const endpoint = this.configService.get<string>("AZURE_OPENAI_ENDPOINT");
    const apiKey = this.configService.get<string>("AZURE_OPENAI_API_KEY");
    const deployment = this.configService.get<string>(
      "AZURE_OPENAI_DEPLOYMENT",
    );

    if (!endpoint || !apiKey || !deployment) {
      throw new Error(
        "Azure OpenAI configuration missing (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT)",
      );
    }

    const apiVersion =
      this.configService.get<string>("AZURE_OPENAI_API_VERSION") ??
      DEFAULT_API_VERSION;
    const base = endpoint.replace(/\/$/, "");
    const url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`;

    this.logger.log(
      `AI recommendation start: ${input.corrections.length} corrections, ${input.availableTools.length} tools`,
    );

    if (input.corrections.length > MAX_CORRECTIONS_IN_PROMPT) {
      this.logger.warn(
        JSON.stringify({
          event: "ai_recommendation_prompt_truncation",
          correctionsTotal: input.corrections.length,
          correctionsIncludedInPrompt: MAX_CORRECTIONS_IN_PROMPT,
        }),
      );
    }

    const systemMessage = buildSystemMessage();
    const userMessage = buildUserMessage(input);

    const debugInfo: PipelineLogEntry[] = [];
    debugInfo.push({
      step: "prompt_build",
      timestamp: new Date().toISOString(),
      data: { systemMessage, userMessage },
    });
    debugInfo.push({
      step: "llm_request",
      timestamp: new Date().toISOString(),
      data: { deployment, apiVersion, maxCompletionTokens: 4096 },
    });

    const payload = {
      messages: [
        {
          role: "system" as const,
          content: systemMessage.replace(/\s+/g, " ").trim(),
        },
        {
          role: "user" as const,
          // Preserve JSON indentation in tools/workflow blocks; only trim outer whitespace.
          content: userMessage.trim(),
        },
      ],
      response_format: { type: "json_object" as const },
      max_completion_tokens: 4096,
    };

    let responseContent: string;
    let tokenUsage: Record<string, unknown> | undefined;
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
          },
          timeout: 120000,
        }),
      );
      responseContent = response.data?.choices?.[0]?.message?.content;
      tokenUsage = response.data?.usage as Record<string, unknown> | undefined;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: unknown } };
      if (axiosErr?.response) {
        const detail =
          typeof axiosErr.response.data === "object"
            ? JSON.stringify(axiosErr.response.data)
            : String(axiosErr.response.data ?? "");
        throw new Error(
          `AI recommendation request failed with status ${axiosErr.response.status}. Response: ${detail}`,
        );
      }
      throw err;
    }

    if (typeof responseContent !== "string") {
      throw new Error(
        "Azure OpenAI response missing choices[0].message.content",
      );
    }

    debugInfo.push({
      step: "llm_response",
      timestamp: new Date().toISOString(),
      data: { rawContent: responseContent, tokenUsage: tokenUsage ?? {} },
    });

    this.logger.debug(`AI recommendation raw response: ${responseContent}`);

    const parsed = parseRecommendationResponse(responseContent);
    if (parsed.jsonParseFailed) {
      this.logger.warn(
        "AI recommendation: model response was not valid JSON; returning empty recommendations",
      );
    }

    const insertion = findSlotImmediatelyAfterAzureOcrExtract(
      input.currentWorkflowSummary.insertionSlots ?? [],
    );

    if (!insertion) {
      this.logger.log(
        "AI recommendation: no edge after structured OCR anchor in insertionSlots; returning empty recommendations",
      );
      return { recommendations: [], analysis: parsed.analysis, debugInfo };
    }

    const allowedIdsList =
      validToolIds ?? input.availableTools.map((t) => t.toolId);
    const allowedIds = new Set(allowedIdsList);

    const recommendations = buildRecommendationsFromModel(parsed, allowedIds);

    this.logger.log(
      `AI recommendation complete: ${recommendations.length} recommendations`,
    );

    return { recommendations, analysis: parsed.analysis, debugInfo };
  }
}
