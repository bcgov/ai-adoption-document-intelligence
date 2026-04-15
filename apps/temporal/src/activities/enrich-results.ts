import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
/**
 * Activity: Enrich OCR results using field schema and optional LLM.
 * Fetches TemplateModel field_schema, applies generic rules, optionally calls Azure OpenAI for low-confidence fields.
 */

import { createActivityLogger } from "../logger";
import type {
  EnrichmentChange,
  EnrichmentResult,
  EnrichmentSummary,
  OCRResult,
} from "../types";
import { getPrismaClient } from "./database-client";
import {
  callAzureOpenAI,
  type LowConfidenceField,
  llmChangesToEnrichmentChanges,
} from "./enrichment-llm";
import type { FieldDef } from "./enrichment-rules";
import {
  applyRules,
  buildFieldMap,
  mergeKeyValuePairs,
} from "./enrichment-rules";

export interface EnrichResultsParams {
  documentId: string;
  ocrResult: OCRResult;
  documentType: string;
  confidenceThreshold?: number;
  enableLlmEnrichment?: boolean;
}

export async function enrichResults(
  params: EnrichResultsParams,
): Promise<EnrichmentResult> {
  const { documentId, ocrResult, documentType } = params;
  const activityName = "enrichResults";
  const log = createActivityLogger(activityName, { documentId });
  const confidenceThreshold = params.confidenceThreshold ?? 0.85;
  const enableLlm = params.enableLlmEnrichment === true;

  log.info("Enrich results start", {
    event: "start",
    fileName: ocrResult.fileName,
    documentType,
    enableLlmEnrichment: enableLlm,
    confidenceThreshold,
  });

  try {
    const prisma = getPrismaClient();
    const templateModel = await prisma.templateModel.findUnique({
      where: { id: documentType },
      include: { field_schema: { orderBy: { display_order: "asc" } } },
    });

    if (
      !templateModel ||
      !templateModel.field_schema ||
      templateModel.field_schema.length === 0
    ) {
      log.info("Enrich results skip", {
        event: "skip",
        reason: "template_model_not_found_or_empty_schema",
        documentType,
      });
      return { ocrResult, summary: null };
    }

    const fieldDefs: FieldDef[] = templateModel.field_schema.map(
      (f: {
        field_key: string;
        field_type: string;
        field_format: string | null;
      }) => ({
        field_key: f.field_key,
        field_type: f.field_type,
        field_format: f.field_format,
      }),
    );
    const fieldMap = buildFieldMap(fieldDefs);

    const {
      ocrResult: ruleResult,
      changes: ruleChanges,
      rulesApplied,
    } = applyRules(ocrResult, fieldMap);
    const allChanges: EnrichmentChange[] = [...ruleChanges];

    let finalResult: OCRResult = ruleResult;
    let llmSummary = "";
    let llmModel: string | undefined;
    const llmChanges: EnrichmentChange[] = [];

    if (enableLlm) {
      const lowConfidenceFields = collectLowConfidenceFields(
        ruleResult,
        fieldMap,
        confidenceThreshold,
      );
      if (lowConfidenceFields.length > 0) {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_API_KEY;
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
        if (endpoint && apiKey && deployment) {
          try {
            const llmResponse = await callAzureOpenAI(
              {
                extractedText: ruleResult.extractedText,
                fields: lowConfidenceFields,
              },
              deployment,
              {
                endpoint,
                apiKey,
                apiVersion: process.env.AZURE_OPENAI_API_VERSION,
                redactPii: process.env.ENRICHMENT_REDACT_PII === "true",
              },
            );
            llmSummary = llmResponse.summary;
            llmModel = deployment;
            llmChanges.push(
              ...llmChangesToEnrichmentChanges(llmResponse.changes),
            );

            const overlay = Object.entries(llmResponse.correctedValues).map(
              ([key, value]) => ({
                key,
                value: String(value),
                confidence: 0.95,
              }),
            );
            const merged = mergeKeyValuePairs(
              ruleResult.keyValuePairs,
              overlay,
            );
            finalResult = { ...ruleResult, keyValuePairs: merged };
            if (
              ruleResult.documents &&
              ruleResult.documents.length > 0 &&
              llmResponse.correctedValues
            ) {
              const doc = {
                ...ruleResult.documents[0],
                fields: { ...ruleResult.documents[0].fields },
              };
              for (const [k, v] of Object.entries(
                llmResponse.correctedValues,
              )) {
                const existing = doc.fields[k];
                if (existing && typeof existing === "object") {
                  (doc.fields as Record<string, unknown>)[k] = {
                    ...(existing as object),
                    content: v,
                  };
                }
              }
              finalResult = { ...finalResult, documents: [doc] };
            }
          } catch (llmError) {
            const msg =
              llmError instanceof Error ? llmError.message : "Unknown error";
            log.error("Enrich results LLM error", {
              event: "llm_error",
              error: msg,
            });
          }
        }
      }
    }

    const summary: EnrichmentSummary | null =
      allChanges.length > 0 || llmChanges.length > 0 || llmSummary
        ? {
            summary:
              llmSummary ||
              (allChanges.length > 0
                ? `Applied ${rulesApplied.join(", ")} to ${allChanges.length} field(s).`
                : ""),
            changes: [...allChanges, ...llmChanges],
            rulesApplied,
            llmEnriched: llmChanges.length > 0,
            llmModel,
            timestamp: new Date().toISOString(),
          }
        : null;

    log.info("Enrich results complete", {
      event: "complete",
      rulesApplied,
      ruleChangeCount: ruleChanges.length,
      llmChangeCount: llmChanges.length,
      hasSummary: !!summary,
    });

    return { ocrResult: finalResult, summary };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    log.error("Enrich results error", {
      event: "error",
      error: errorMessage,
      stack: getErrorStack(error),
    });
    return { ocrResult, summary: null };
  }
}

function collectLowConfidenceFields(
  ocrResult: OCRResult,
  fieldMap: Record<string, { type: string; format?: string }>,
  threshold: number,
): LowConfidenceField[] {
  const out: LowConfidenceField[] = [];
  for (const pair of ocrResult.keyValuePairs) {
    const key = (pair.key?.content ?? "").trim();
    const value = (pair.value?.content ?? "").trim();
    const conf = pair.confidence ?? 0;
    const normalizedConf = conf > 1 ? conf / 100 : conf;
    if (key && normalizedConf < threshold) {
      out.push({
        fieldKey: key,
        value,
        expectedType: fieldMap[key]?.type ?? "string",
        confidence: normalizedConf,
      });
    }
  }
  if (ocrResult.documents && ocrResult.documents.length > 0) {
    const fields = ocrResult.documents[0].fields as Record<
      string,
      { content?: string; confidence?: number }
    >;
    for (const [key, data] of Object.entries(fields)) {
      const content = data?.content ?? "";
      const conf = (data?.confidence ?? 0) as number;
      const normalizedConf = conf > 1 ? conf / 100 : conf;
      if (normalizedConf < threshold) {
        out.push({
          fieldKey: key,
          value: typeof content === "string" ? content : String(content),
          expectedType: fieldMap[key]?.type ?? "string",
          confidence: normalizedConf,
        });
      }
    }
  }
  return out;
}
