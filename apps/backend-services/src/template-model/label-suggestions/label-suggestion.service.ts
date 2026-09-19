import { FieldType } from "@generated/client";
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import type { AnalysisResponse } from "@/ocr/azure-types";
import { FieldType as DtoFieldType } from "../dto/field-definition.dto";
import type { SuggestedFieldDto } from "../dto/field-suggestion.dto";
import type { LabelSuggestionDto } from "../dto/suggestion.dto";
import { TemplateModelDbService } from "../template-model-db.service";
import type { TemplateModelData } from "../template-model-db.types";
import {
  buildSuggestFieldsPrompt,
  buildSuggestLabelsPrompt,
  SUGGEST_FIELDS_SYSTEM,
  SUGGEST_LABELS_SYSTEM,
  type SuggestedFieldType,
  suggestFieldsReplySchema,
  suggestLabelsReplySchema,
} from "./prompts";
import { resolveRefs, type SuggestedRef } from "./resolve-refs";
import { SuggestionLlmService } from "./suggestion-llm";
import {
  renderTaggedText,
  type TaggedText,
  TaggedTextLimitError,
} from "./tagged-text";

/** Suggested-field replies are cut to this many fields. */
export const MAX_SUGGESTED_FIELDS = 200;

const DTO_FIELD_TYPES: Record<SuggestedFieldType, DtoFieldType> = {
  string: DtoFieldType.STRING,
  number: DtoFieldType.NUMBER,
  date: DtoFieldType.DATE,
  selectionMark: DtoFieldType.SELECTION_MARK,
  signature: DtoFieldType.SIGNATURE,
};

@Injectable()
export class LabelSuggestionService {
  constructor(
    private readonly templateModelDb: TemplateModelDbService,
    private readonly llm: SuggestionLlmService,
    private readonly logger: AppLoggerService,
  ) {}

  /** Suggested labels for one document; at most one per field, nothing guessed. */
  async suggestLabels(
    templateModelId: string,
    documentId: string,
  ): Promise<LabelSuggestionDto[]> {
    const { templateModel, tagged } = await this.load(
      templateModelId,
      documentId,
    );
    if (templateModel.field_schema.length === 0) {
      throw new HttpException(
        {
          message:
            "Add fields to the template model before loading suggestions",
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const reply = await this.llm.generate({
      system: SUGGEST_LABELS_SYSTEM,
      prompt: buildSuggestLabelsPrompt(
        templateModel.field_schema.map((field) => ({
          key: field.field_key,
          type: field.field_type,
          description: field.description,
        })),
        tagged.text,
      ),
      schema: suggestLabelsReplySchema,
      schemaName: "suggested_labels",
    });

    const fieldsByKey = new Map(
      templateModel.field_schema.map((field) => [field.field_key, field]),
    );
    const claimed = new Set<string>();
    const seen = new Set<string>();
    const suggestions: LabelSuggestionDto[] = [];
    for (const item of reply.fields) {
      const field = fieldsByKey.get(item.key);
      if (!field || seen.has(item.key)) continue;
      seen.add(item.key);
      const resolved = resolveRefs(
        item.refs,
        tagged,
        field.field_type === FieldType.selectionMark,
        claimed,
      );
      if (!resolved) {
        if (item.refs.length > 0) {
          this.logger.debug("Dropped a suggested label that did not match", {
            field_key: item.key,
          });
        }
        continue;
      }
      for (const id of resolved.elementIds) claimed.add(id);
      suggestions.push({
        field_key: field.field_key,
        label_name: field.field_key,
        value: resolved.value,
        page_number: resolved.pageNumber,
        element_ids: resolved.elementIds,
        bounding_box: { polygon: resolved.polygon },
        source_type: "llm",
        explanation: explainRefs(item.refs),
      });
    }
    return suggestions;
  }

  /** Suggested fields read from one document, with the value found for each. */
  async suggestFields(
    templateModelId: string,
    documentId: string,
  ): Promise<SuggestedFieldDto[]> {
    const { templateModel, tagged } = await this.load(
      templateModelId,
      documentId,
    );
    const reply = await this.llm.generate({
      system: SUGGEST_FIELDS_SYSTEM,
      prompt: buildSuggestFieldsPrompt(tagged.text),
      schema: suggestFieldsReplySchema,
      schemaName: "suggested_fields",
    });

    const existing = new Set(
      templateModel.field_schema.map((field) => field.field_key),
    );
    const usedKeys = new Set<string>();
    const claimed = new Set<string>();
    const result: SuggestedFieldDto[] = [];
    for (const item of reply.fields.slice(0, MAX_SUGGESTED_FIELDS)) {
      const key = uniqueKey(normalizeFieldKey(item.key), usedKeys);
      usedKeys.add(key);
      const resolved = resolveRefs(
        item.refs,
        tagged,
        item.type === "selectionMark",
        claimed,
      );
      if (resolved) {
        for (const id of resolved.elementIds) claimed.add(id);
      }
      result.push({
        field_key: key,
        field_type: DTO_FIELD_TYPES[item.type],
        description: item.description.trim(),
        value: resolved?.value ?? null,
        page_number: resolved?.pageNumber ?? null,
        already_exists: existing.has(key),
      });
    }
    return result;
  }

  private async load(
    templateModelId: string,
    documentId: string,
  ): Promise<{ templateModel: TemplateModelData; tagged: TaggedText }> {
    const templateModel =
      await this.templateModelDb.findTemplateModel(templateModelId);
    if (!templateModel) {
      throw new NotFoundException(
        `Template model with id ${templateModelId} not found`,
      );
    }
    const labeledDoc = await this.templateModelDb.findLabeledDocument(
      templateModelId,
      documentId,
    );
    if (!labeledDoc) {
      throw new NotFoundException(
        `Document ${documentId} not found in template model ${templateModelId}`,
      );
    }
    const ocr = labeledDoc.labeling_document
      .ocr_result as unknown as AnalysisResponse | null;
    if (!ocr?.analyzeResult) {
      throw new NotFoundException(
        `OCR result not found for labeling document ${documentId}`,
      );
    }
    try {
      return { templateModel, tagged: renderTaggedText(ocr.analyzeResult) };
    } catch (error) {
      if (error instanceof TaggedTextLimitError) {
        throw new HttpException(
          { message: error.message },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw error;
    }
  }
}

/** Lowercase snake_case starting with a letter; "field" when nothing is left. */
export function normalizeFieldKey(raw: string): string {
  const key = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (key.length === 0) return "field";
  return /^[a-z]/.test(key) ? key : `field_${key}`;
}

function uniqueKey(key: string, used: ReadonlySet<string>): string {
  if (!used.has(key)) return key;
  let suffix = 2;
  while (used.has(`${key}_${suffix}`)) suffix += 1;
  return `${key}_${suffix}`;
}

function explainRefs(refs: SuggestedRef[]): string {
  return refs
    .map((ref) => {
      const tag = ref.tag.trim();
      if (tag.startsWith("S")) return `Checkbox ${tag}`;
      if (tag.startsWith("T")) return `Table cell ${tag}`;
      return `Line ${tag}`;
    })
    .join(", ");
}
