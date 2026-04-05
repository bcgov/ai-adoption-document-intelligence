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

function buildUserMessage(errorData: ErrorData): string {
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

  return `Fields in this template model:
${fieldsJson}

HITL corrections grouped by field (${errorData.totalCorrectionCount} total):
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

  if (!Array.isArray(parsed)) return [];

  return (parsed as AiSuggestionRaw[])
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
   * Gather HITL correction data for a given template model.
   * Loads the template model's fields and queries FieldCorrection records
   * filtered by group_id and field keys present in the template model.
   */
  async gatherErrorData(templateModelId: string): Promise<ErrorData> {
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

    // Group corrections by field key
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

    return {
      fields,
      corrections: grouped,
      totalCorrectionCount: corrections.length,
    };
  }

  /**
   * Analyze correction data and suggest field format specs via Azure OpenAI.
   * Returns an empty array if there are no corrections or if the AI has no suggestions.
   */
  async suggestFormats(templateModelId: string): Promise<FormatSuggestion[]> {
    const errorData = await this.gatherErrorData(templateModelId);

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
    const userMessage = buildUserMessage(errorData);

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
