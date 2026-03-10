import type { KeyValuePair, OCRResult } from "../types";
import type { DocumentSegment } from "./split-document";

export interface ClassificationRule {
  name: string;
  patterns: {
    field: string;
    operator: "contains" | "matches" | "startsWith";
    value: string;
  }[];
  resultType: string;
}

export interface ClassifyDocumentInput {
  ocrResult: OCRResult;
  segment: DocumentSegment;
  classifierType: "rule-based";
  rules?: ClassificationRule[];
}

export interface ClassifyDocumentOutput {
  segmentType: string;
  confidence: number;
  matchedRule?: string;
}

// No default rules - all classification rules must be provided via input.rules parameter.
// This keeps the system generic and prevents document-specific logic in the backend.
const DEFAULT_RULES: ClassificationRule[] = [];

export async function classifyDocument(
  input: ClassifyDocumentInput,
): Promise<ClassifyDocumentOutput> {
  if (input.classifierType !== "rule-based") {
    throw new Error(`Unsupported classifierType: ${input.classifierType}`);
  }

  const rules =
    input.rules && input.rules.length > 0 ? input.rules : DEFAULT_RULES;
  const context = buildContext(input.ocrResult);

  for (const rule of rules) {
    const matches = rule.patterns.every((pattern) =>
      matchesPattern(pattern, context),
    );
    if (matches) {
      return {
        segmentType: rule.resultType,
        confidence: 0.9,
        matchedRule: rule.name,
      };
    }
  }

  return {
    segmentType: "unknown",
    confidence: 0.2,
  };
}

function buildContext(ocrResult: OCRResult): Record<string, string[]> {
  return {
    text: [ocrResult.extractedText ?? ""],
    title: [firstNonEmptyLine(ocrResult.extractedText ?? "")],
    paragraph: ocrResult.paragraphs.map((p) => p.content ?? ""),
    section: ocrResult.sections.map((s) => s.content ?? ""),
    "keyValuePair.key": extractKeyValueStrings(ocrResult.keyValuePairs, "key"),
    "keyValuePair.value": extractKeyValueStrings(
      ocrResult.keyValuePairs,
      "value",
    ),
  };
}

function extractKeyValueStrings(
  pairs: KeyValuePair[],
  field: "key" | "value",
): string[] {
  return pairs
    .map((pair) => {
      if (field === "key") {
        return pair.key?.content ?? "";
      }
      return pair.value?.content ?? "";
    })
    .filter((value) => value.length > 0);
}

function matchesPattern(
  pattern: ClassificationRule["patterns"][number],
  context: Record<string, string[]>,
): boolean {
  const values = context[pattern.field] ?? [];
  if (values.length === 0) {
    return false;
  }

  switch (pattern.operator) {
    case "contains":
      return values.some((value) =>
        value.toLowerCase().includes(pattern.value.toLowerCase()),
      );
    case "startsWith":
      return values.some((value) =>
        value.toLowerCase().startsWith(pattern.value.toLowerCase()),
      );
    case "matches": {
      const regex = new RegExp(pattern.value, "i");
      return values.some((value) => regex.test(value));
    }
    default:
      return false;
  }
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}
