/**
 * Format Suggestion Service
 *
 * Analyzes HITL correction patterns and recommends field format specifications
 * via Azure OpenAI. The model examines corrections to identify consistent
 * formatting patterns (digits-only, dates, phone numbers, etc.) and suggests
 * canonicalize + pattern + displayTemplate specs.
 */

import { PrismaClient } from "@generated/client";
import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "@/database/prisma.service";

interface BenchmarkRunMetrics {
  perSampleResults?: Array<{
    sampleId: string;
    evaluationDetails?: Array<{
      field: string;
      matched: boolean;
      expected?: unknown;
      predicted?: unknown;
    }>;
  }>;
}

const DEFAULT_API_VERSION = "2024-12-01-preview";
const MAX_CORRECTIONS = 200;

export interface FormatSpecValue {
  canonicalize: string;
  pattern?: string;
  displayTemplate?: string;
}

export interface FormatSuggestion {
  fieldKey: string;
  formatSpec: FormatSpecValue;
  rationale: string;
  sampleCount: number;
}

export interface FieldInfo {
  field_key: string;
  field_type: string;
  format_spec: string | null;
}

export interface CorrectionRecord {
  field_key: string;
  original_value: string | null;
  corrected_value: string | null;
}

/** Grouped corrections keyed by field_key. */
export interface GroupedCorrections {
  [fieldKey: string]: Array<{
    original: string | null;
    corrected: string | null;
  }>;
}

export interface ErrorData {
  fields: FieldInfo[];
  corrections: GroupedCorrections;
  totalCorrectionCount: number;
}

function buildSystemMessage(): string {
  return `You are an expert at analyzing OCR error patterns and recommending field format specifications.
You must respond with valid JSON only. Do not use markdown code fences or any text outside the JSON.`;
}

function buildUserMessage(
  errorData: ErrorData,
  hasBenchmarkData: boolean,
): string {
  const fieldsJson = JSON.stringify(
    errorData.fields.map((f) => ({
      fieldKey: f.field_key,
      fieldType: f.field_type,
      currentFormatSpec: f.format_spec ? JSON.parse(f.format_spec) : null,
    })),
    null,
    2,
  );

  const correctionsJson = JSON.stringify(errorData.corrections, null, 2);

  const dataLabel = hasBenchmarkData
    ? "corrections and benchmark mismatches"
    : "HITL corrections";

  return `Fields in this template model:
${fieldsJson}

${dataLabel} grouped by field (${errorData.totalCorrectionCount} total):
${correctionsJson}

Available canonicalize operations (chainable with "|"):
- digits: Strip all non-digit characters
- uppercase: Convert to uppercase
- lowercase: Convert to lowercase
- strip-spaces: Remove all whitespace
- text: No transformation (plain text)
- number: Parse as number
- date:FORMAT: Parse and reformat dates (e.g. date:YYYY-MM-DD)
- noop: No operation

Format spec structure:
{
  "canonicalize": "<operation or chain like 'digits|strip-spaces'>",
  "pattern": "<optional regex the canonicalized value must match>",
  "displayTemplate": "<optional display template using # as digit placeholder>"
}

Respond with a JSON array of suggestions:
[
  {
    "fieldKey": "<field key>",
    "formatSpec": { "canonicalize": "...", "pattern": "...", "displayTemplate": "..." },
    "rationale": "<brief reason>"
  }
]

Rules:
- Skip fields that already have a format_spec (currentFormatSpec is not null)
- Skip fields with too few corrections to identify a reliable pattern
- Skip free-text fields where no consistent format exists
- Return an empty array [] if no suggestions can be made
- Only suggest formats when the correction data shows a clear, consistent pattern`;
}

interface AiSuggestionRaw {
  fieldKey: string;
  formatSpec: {
    canonicalize: string;
    pattern?: string;
    displayTemplate?: string;
  };
  rationale: string;
}

/**
 * Normalize the AI response into an array of suggestion objects.
 * Handles three response shapes:
 * - Array: `[{ fieldKey, formatSpec, rationale }]`
 * - Object with suggestions key: `{ suggestions: [...] }`
 * - Object keyed by field name: `{ "sin": { formatSpec, rationale }, ... }`
 */
function normalizeToArray(parsed: unknown): AiSuggestionRaw[] {
  if (Array.isArray(parsed)) return parsed as AiSuggestionRaw[];

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    // Shape: { suggestions: [...] }
    if (Array.isArray(obj.suggestions)) {
      return obj.suggestions as AiSuggestionRaw[];
    }

    // Shape: { "fieldKey": { formatSpec, rationale }, ... }
    const entries = Object.entries(obj);
    if (
      entries.length > 0 &&
      entries.every(
        ([, v]) =>
          typeof v === "object" &&
          v !== null &&
          "formatSpec" in (v as Record<string, unknown>),
      )
    ) {
      return entries.map(([key, value]) => {
        const v = value as Record<string, unknown>;
        return {
          fieldKey: key,
          formatSpec: v.formatSpec as AiSuggestionRaw["formatSpec"],
          rationale: (v.rationale as string) ?? "",
        };
      });
    }
  }

  return [];
}

function parseResponse(
  content: string,
  corrections: GroupedCorrections,
): FormatSuggestion[] {
  let raw = content.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = raw.match(fence);
  if (match) raw = match[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const items = normalizeToArray(parsed);
  if (items.length === 0) return [];

  return items
    .filter(
      (item): item is AiSuggestionRaw =>
        typeof item === "object" &&
        item !== null &&
        typeof item.fieldKey === "string" &&
        typeof item.formatSpec === "object" &&
        item.formatSpec !== null &&
        typeof item.formatSpec.canonicalize === "string" &&
        typeof item.rationale === "string",
    )
    .map((item) => ({
      fieldKey: item.fieldKey,
      formatSpec: {
        canonicalize: item.formatSpec.canonicalize,
        ...(item.formatSpec.pattern !== undefined && {
          pattern: item.formatSpec.pattern,
        }),
        ...(item.formatSpec.displayTemplate !== undefined && {
          displayTemplate: item.formatSpec.displayTemplate,
        }),
      },
      rationale: item.rationale,
      sampleCount: corrections[item.fieldKey]?.length ?? 0,
    }));
}

@Injectable()
export class FormatSuggestionService {
  private readonly logger = new Logger(FormatSuggestionService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Gather HITL correction data (and optionally benchmark mismatch data)
   * for a given template model.
   * Loads the template model's fields and queries FieldCorrection records
   * filtered by group_id and field keys present in the template model.
   * When benchmarkRunIds are provided, also merges mismatch pairs from those runs.
   */
  async gatherErrorData(
    templateModelId: string,
    benchmarkRunIds?: string[],
  ): Promise<ErrorData> {
    const templateModel = await this.prisma.templateModel.findUniqueOrThrow({
      where: { id: templateModelId },
      include: { field_schema: true },
    });

    const fields: FieldInfo[] = templateModel.field_schema.map((f) => ({
      field_key: f.field_key,
      field_type: f.field_type,
      format_spec: f.format_spec,
    }));

    const fieldKeys = fields.map((f) => f.field_key);

    if (fieldKeys.length === 0) {
      return { fields, corrections: {}, totalCorrectionCount: 0 };
    }

    // Query HITL corrections: FieldCorrection -> ReviewSession -> Document
    // Filter by group_id matching the template model and field_key in the model's field keys
    const corrections = await this.prisma.fieldCorrection.findMany({
      where: {
        action: "corrected",
        field_key: { in: fieldKeys },
        session: {
          document: {
            group_id: templateModel.group_id,
          },
        },
      },
      select: {
        field_key: true,
        original_value: true,
        corrected_value: true,
      },
      take: MAX_CORRECTIONS,
      orderBy: { created_at: "desc" },
    });

    // Group HITL corrections by field key
    const grouped: GroupedCorrections = {};
    for (const correction of corrections) {
      if (!grouped[correction.field_key]) {
        grouped[correction.field_key] = [];
      }
      grouped[correction.field_key].push({
        original: correction.original_value,
        corrected: correction.corrected_value,
      });
    }

    // Merge benchmark run mismatch pairs when IDs are provided
    if (benchmarkRunIds && benchmarkRunIds.length > 0) {
      const mismatchPairs = await this.fetchBenchmarkMismatchPairs(
        benchmarkRunIds,
        fieldKeys,
      );
      for (const pair of mismatchPairs) {
        if (!grouped[pair.fieldKey]) {
          grouped[pair.fieldKey] = [];
        }
        grouped[pair.fieldKey].push({
          original: pair.original,
          corrected: pair.corrected,
        });
      }
    }

    const totalCorrectionCount = Object.values(grouped).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );

    return {
      fields,
      corrections: grouped,
      totalCorrectionCount,
    };
  }

  /**
   * Extract mismatch pairs from benchmark run perSampleResults.evaluationDetails.
   * Filters by field keys that belong to the template model.
   */
  private async fetchBenchmarkMismatchPairs(
    benchmarkRunIds: string[],
    fieldKeys: string[],
  ): Promise<Array<{ fieldKey: string; original: string; corrected: string }>> {
    const runs = await this.prisma.benchmarkRun.findMany({
      where: { id: { in: benchmarkRunIds }, status: "completed" },
      select: { id: true, metrics: true },
    });

    const pairs: Array<{
      fieldKey: string;
      original: string;
      corrected: string;
    }> = [];

    for (const run of runs) {
      const metrics = run.metrics as BenchmarkRunMetrics | null;
      const perSampleResults = Array.isArray(metrics?.perSampleResults)
        ? metrics.perSampleResults
        : [];

      for (const sample of perSampleResults) {
        if (!Array.isArray(sample.evaluationDetails)) continue;
        for (const detail of sample.evaluationDetails) {
          if (detail.matched) continue;
          if (!fieldKeys.includes(detail.field)) continue;

          const predicted = String(detail.predicted ?? "");
          const expected = String(detail.expected ?? "");
          if (!predicted || !expected || predicted === expected) continue;

          pairs.push({
            fieldKey: detail.field,
            original: predicted,
            corrected: expected,
          });
        }
      }
    }

    return pairs;
  }

  /**
   * Analyze correction data (and optionally benchmark mismatches) and suggest
   * field format specs via Azure OpenAI.
   * Returns an empty array if there are no corrections or if the AI has no suggestions.
   */
  async suggestFormats(
    templateModelId: string,
    benchmarkRunIds?: string[],
  ): Promise<FormatSuggestion[]> {
    const errorData = await this.gatherErrorData(
      templateModelId,
      benchmarkRunIds,
    );

    if (errorData.totalCorrectionCount === 0) {
      this.logger.log(
        `No corrections found for template model ${templateModelId}; skipping AI call`,
      );
      return [];
    }

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
      `Format suggestion start: ${errorData.totalCorrectionCount} corrections, ${errorData.fields.length} fields`,
    );

    const systemMessage = buildSystemMessage();
    const hasBenchmarkData = !!(benchmarkRunIds && benchmarkRunIds.length > 0);
    const userMessage = buildUserMessage(errorData, hasBenchmarkData);

    const payload = {
      messages: [
        {
          role: "system" as const,
          content: systemMessage.replace(/\s+/g, " ").trim(),
        },
        {
          role: "user" as const,
          content: userMessage.replace(/\s+/g, " ").trim(),
        },
      ],
      response_format: { type: "json_object" as const },
      max_completion_tokens: 4096,
    };

    let responseContent: string;
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
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: unknown } };
      if (axiosErr?.response) {
        const detail =
          typeof axiosErr.response.data === "object"
            ? JSON.stringify(axiosErr.response.data)
            : String(axiosErr.response.data ?? "");
        throw new Error(
          `Format suggestion request failed with status ${axiosErr.response.status}. Response: ${detail}`,
        );
      }
      throw err;
    }

    if (typeof responseContent !== "string") {
      throw new Error(
        "Azure OpenAI response missing choices[0].message.content",
      );
    }

    this.logger.debug(`Format suggestion raw response: ${responseContent}`);

    const suggestions = parseResponse(responseContent, errorData.corrections);

    this.logger.log(
      `Format suggestion complete: ${suggestions.length} suggestions`,
    );

    return suggestions;
  }
}
