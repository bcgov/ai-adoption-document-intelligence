export interface ValidationRule {
  name: string;
  type: "field-match" | "arithmetic" | "array-match";

  // For field-match type
  primaryField?: string;
  attachmentField?: string;

  // For arithmetic type (e.g., net = gross - deductions)
  expression?: {
    operation: "sum" | "difference" | "product";
    fields: string[];
    equals: string;
  };

  // For array-match type (e.g., find Page 1 amounts in Page 3 deposits)
  primaryFields?: string[];
  attachmentFields?: string[];
  matchType?: "any" | "all";

  // Common options
  operator?: "equals" | "approximately";
  tolerance?: {
    amount?: number; // Absolute tolerance (e.g., 0.05 for ±$0.05)
    percentage?: number; // Percentage tolerance (e.g., 1 for ±1%)
  };
  fieldType?: "text" | "number" | "currency";
}

export interface DocumentValidateFieldsInput {
  processedSegments: Array<Record<string, unknown>>;
  documentId: string;
  rules?: ValidationRule[];
}

export interface ValidationResultEntry {
  rule: string;
  primaryValue?: string | number;
  attachmentValues: (string | number)[];
  matched: boolean;
  matchType?: "exact" | "within-tolerance" | "partial";
  tolerance?: number;
  reason?: string;
  details?: {
    actualDelta?: number;
    allowedTolerance?: number;
  };
}

export interface DocumentValidateFieldsOutput {
  validationResults: {
    documentId: string;
    entries: ValidationResultEntry[];
    summary: {
      matched: number;
      mismatched: number;
      missing: number;
    };
  };
}

// No default rules - all validation rules must be provided via input.rules parameter.
// This keeps the system generic and prevents document-specific logic in the backend.
const DEFAULT_RULES: ValidationRule[] = [];

interface KeyValuePair {
  key?: {
    content?: string;
    boundingRegions?: Array<{ pageNumber?: number }>;
  };
  value?: {
    content?: string;
    boundingRegions?: Array<{ pageNumber?: number }>;
  };
}

export async function validateDocumentFields(
  input: DocumentValidateFieldsInput,
): Promise<DocumentValidateFieldsOutput> {
  const rules =
    input.rules && input.rules.length > 0 ? input.rules : DEFAULT_RULES;
  const normalizedSegments = normalizeProcessedSegments(
    input.processedSegments,
  );
  const primary = enrichPrimaryWithSegmentPages(
    normalizedSegments[0],
    normalizedSegments,
  );
  const attachments = normalizedSegments.slice(1);

  const entries: ValidationResultEntry[] = rules.map((rule) => {
    // Route to appropriate validator based on rule type
    switch (rule.type) {
      case "field-match":
        return validateFieldMatch(rule, primary, attachments);
      case "arithmetic":
        return validateArithmetic(rule, primary);
      case "array-match":
        return validateArrayMatch(rule, primary, attachments);
      default:
        return {
          rule: rule.name,
          attachmentValues: [],
          matched: false,
          reason: `Unknown rule type: ${(rule as ValidationRule).type}`,
        };
    }
  });

  const summary = entries.reduce(
    (acc, entry) => {
      if (entry.reason?.startsWith("missing")) {
        acc.missing += 1;
        return acc;
      }
      if (entry.matched) {
        acc.matched += 1;
      } else {
        acc.mismatched += 1;
      }
      return acc;
    },
    { matched: 0, mismatched: 0, missing: 0 },
  );

  return {
    validationResults: {
      documentId: input.documentId,
      entries,
      summary,
    },
  };
}

// ============================================================================
// Core Utility Functions
// ============================================================================

function resolveField(
  segment: Record<string, unknown>,
  fieldPath: string,
): unknown {
  const keys = fieldPath.split(".");
  let current: unknown = segment;
  for (const key of keys) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function parseCurrency(value: unknown): number | undefined {
  let str: string;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    str = value;
  } else {
    str = String(value);
  }

  // Remove currency symbols, commas, whitespace, and leading plus sign
  let cleaned = str.replace(/[$,\s]/g, "").trim();
  let isNegative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    isNegative = true;
    cleaned = cleaned.slice(1, -1);
  }
  cleaned = cleaned.replace(/^\+/, "");
  cleaned = cleaned.replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);

  if (!Number.isFinite(num)) {
    return undefined;
  }

  return isNegative ? -num : num;
}

function matchesWithTolerance(
  value1: number,
  value2: number,
  tolerance?: { amount?: number; percentage?: number },
): { matched: boolean; delta: number } {
  const delta = Math.abs(value1 - value2);

  if (!tolerance) {
    return { matched: value1 === value2, delta };
  }

  if (tolerance.amount !== undefined && delta <= tolerance.amount) {
    return { matched: true, delta };
  }

  if (tolerance.percentage !== undefined && value1 !== 0) {
    const percentDelta = (delta / Math.abs(value1)) * 100;
    if (percentDelta <= tolerance.percentage) {
      return { matched: true, delta };
    }
  }

  return { matched: false, delta };
}

function normalizeValue(
  value: unknown,
  fieldType?: string,
): string | number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (fieldType === "currency" || fieldType === "number") {
    const num = parseCurrency(value);
    return num;
  }

  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return value;
  }
  return String(value);
}

function normalizeProcessedSegments(
  processedSegments: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return processedSegments.map((segment) => {
    const baseSegment = unwrapCombinedSegment(segment);
    const derivedSegment: Record<string, unknown> = { ...baseSegment };
    const extractedFields = extractKeyValueFields(baseSegment);

    if (Object.keys(extractedFields).length > 0) {
      const segmentIndex = getSegmentIndex(baseSegment);
      if (segmentIndex !== undefined) {
        const pageKey = `page${segmentIndex}`;
        derivedSegment[pageKey] = mergeFieldValues(
          derivedSegment[pageKey],
          extractedFields,
        );
      }

      for (const [key, value] of Object.entries(extractedFields)) {
        derivedSegment[key] = mergeFieldValues(derivedSegment[key], value);
      }
    }

    return derivedSegment;
  });
}

function unwrapCombinedSegment(
  segment: Record<string, unknown>,
): Record<string, unknown> {
  const combinedSegment = segment.combinedSegment;
  if (combinedSegment && typeof combinedSegment === "object") {
    return combinedSegment as Record<string, unknown>;
  }
  return segment;
}

function getSegmentIndex(segment: Record<string, unknown>): number | undefined {
  const value = segment.segmentIndex;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractKeyValueFields(
  segment: Record<string, unknown>,
): Record<string, unknown> {
  const ocrResult = segment.ocrResult;
  if (!ocrResult || typeof ocrResult !== "object") {
    return {};
  }

  const keyValuePairs = (ocrResult as Record<string, unknown>).keyValuePairs;
  if (!Array.isArray(keyValuePairs)) {
    return {};
  }

  const extracted: Record<string, unknown> = {};
  const checkboxKeyFlags: Record<string, boolean> = {};

  for (const pair of keyValuePairs as KeyValuePair[]) {
    const rawKey = pair.key?.content ?? "";
    const rawValue = pair.value?.content ?? "";
    const trimmedKey = rawKey.trim();
    const trimmedValue = rawValue.trim();
    const isCheckboxKey = /^o\s+/i.test(trimmedKey);

    if (!trimmedValue || /^:unselected:$/i.test(trimmedValue)) {
      continue;
    }
    const normalizedKey = normalizeKey(rawKey);

    if (!normalizedKey) {
      continue;
    }

    const normalizedValue = normalizeKeyValue(rawValue);
    // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn requires ES2022; project lib is older
    const hasExisting = Object.prototype.hasOwnProperty.call(
      extracted,
      normalizedKey,
    );
    const existingIsCheckbox = checkboxKeyFlags[normalizedKey] ?? false;

    if (!hasExisting) {
      extracted[normalizedKey] = normalizedValue;
      checkboxKeyFlags[normalizedKey] = isCheckboxKey;
      continue;
    }

    if (existingIsCheckbox && !isCheckboxKey) {
      extracted[normalizedKey] = normalizedValue;
      checkboxKeyFlags[normalizedKey] = false;
      continue;
    }

    if (!existingIsCheckbox && isCheckboxKey) {
      continue;
    }

    extracted[normalizedKey] = mergeFieldValues(
      extracted[normalizedKey],
      normalizedValue,
    );
  }

  return extracted;
}

function normalizeKey(label: string): string {
  let cleaned = label.replace(/^[^a-zA-Z0-9]+/, "");
  cleaned = cleaned.replace(/^[oO]\s+(?=[a-zA-Z])/, "");
  cleaned = cleaned.replace(/\([^)]*\)/g, " ");
  cleaned = cleaned.replace(/[:;]+/g, " ");
  cleaned = cleaned.replace(/(?:^|\s)[+-]?\d[\d,.\s]*$/g, " ");
  cleaned = cleaned
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

  if (!cleaned) {
    return "";
  }

  const parts = cleaned.split(/\s+/);
  return parts[0] + parts.slice(1).map(capitalize).join("");
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function normalizeKeyValue(value: string): string | string[] {
  const cleaned = value.replace(/\[\d+]/g, "").trim();
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return lines[0] ?? "";
  }
  return lines;
}

function mergeFieldValues(existing: unknown, incoming: unknown): unknown {
  if (existing === undefined) {
    return incoming;
  }

  if (isRecord(existing) && isRecord(incoming)) {
    return { ...existing, ...incoming };
  }

  const existingArray = Array.isArray(existing) ? existing : [existing];
  const incomingArray = Array.isArray(incoming) ? incoming : [incoming];

  return [...existingArray, ...incomingArray];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function enrichPrimaryWithSegmentPages(
  primary: Record<string, unknown> | undefined,
  segments: Array<Record<string, unknown>>,
): Record<string, unknown> {
  if (!primary) {
    return {};
  }

  const enriched: Record<string, unknown> = { ...primary };

  for (const segment of segments) {
    const segmentIndex = getSegmentIndex(segment);
    if (segmentIndex === undefined) {
      continue;
    }

    const pageKey = `page${segmentIndex}`;
    if (segment[pageKey] !== undefined) {
      enriched[pageKey] = segment[pageKey];
    }
  }

  return enriched;
}

// ============================================================================
// Rule Type Validators
// ============================================================================

function validateFieldMatch(
  rule: ValidationRule,
  primary: Record<string, unknown>,
  attachments: Array<Record<string, unknown>>,
): ValidationResultEntry {
  if (!rule.primaryField || !rule.attachmentField) {
    return {
      rule: rule.name,
      attachmentValues: [],
      matched: false,
      reason: "field-match rule requires primaryField and attachmentField",
    };
  }

  const operator = rule.operator ?? "equals";
  const fieldType = rule.fieldType ?? "text";

  const primaryValue = normalizeValue(
    resolveField(primary, rule.primaryField),
    fieldType,
  );

  const attachmentValues = attachments
    .map((segment) =>
      normalizeValue(resolveField(segment, rule.attachmentField!), fieldType),
    )
    .filter((value): value is string | number => value !== undefined);

  if (primaryValue === undefined) {
    return {
      rule: rule.name,
      attachmentValues,
      matched: false,
      reason: "missing primary field",
    };
  }

  if (attachmentValues.length === 0) {
    return {
      rule: rule.name,
      primaryValue,
      attachmentValues: [],
      matched: false,
      reason: "missing attachment field",
    };
  }

  // Numeric comparison with tolerance
  if (
    operator === "approximately" &&
    typeof primaryValue === "number" &&
    attachmentValues.every((v) => typeof v === "number")
  ) {
    const numericAttachments = attachmentValues as number[];
    const allMatch = numericAttachments.every((attachValue) => {
      const result = matchesWithTolerance(
        primaryValue,
        attachValue,
        rule.tolerance,
      );
      return result.matched;
    });

    const deltas = numericAttachments.map((v) =>
      matchesWithTolerance(primaryValue, v, rule.tolerance),
    );
    const maxDelta = Math.max(...deltas.map((d) => d.delta));

    return {
      rule: rule.name,
      primaryValue,
      attachmentValues: numericAttachments,
      matched: allMatch,
      matchType: allMatch ? "within-tolerance" : "exact",
      tolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
      reason: allMatch ? undefined : "attachment mismatch",
      details: {
        actualDelta: maxDelta,
        allowedTolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
      },
    };
  }

  // String comparison
  if (typeof primaryValue === "string") {
    const matched = attachmentValues.every(
      (value) =>
        typeof value === "string" &&
        value.toLowerCase() === primaryValue.toLowerCase(),
    );

    return {
      rule: rule.name,
      primaryValue,
      attachmentValues,
      matched,
      matchType: "exact",
      reason: matched ? undefined : "attachment mismatch",
    };
  }

  // Fallback: exact equality
  const matched = attachmentValues.every((value) => value === primaryValue);
  return {
    rule: rule.name,
    primaryValue,
    attachmentValues,
    matched,
    matchType: "exact",
    reason: matched ? undefined : "attachment mismatch",
  };
}

function validateArithmetic(
  rule: ValidationRule,
  primary: Record<string, unknown>,
): ValidationResultEntry {
  if (!rule.expression) {
    return {
      rule: rule.name,
      attachmentValues: [],
      matched: false,
      reason: "arithmetic rule requires expression",
    };
  }

  const { operation, fields, equals: equalsField } = rule.expression;
  const operator = rule.operator ?? "equals";
  const fieldType = rule.fieldType ?? "number";

  // Resolve all field values
  const fieldValues = fields.map((fieldPath) =>
    normalizeValue(resolveField(primary, fieldPath), fieldType),
  );

  const equalsValue = normalizeValue(
    resolveField(primary, equalsField),
    fieldType,
  );

  // Check if all values are present
  if (fieldValues.some((v) => v === undefined) || equalsValue === undefined) {
    return {
      rule: rule.name,
      attachmentValues: [],
      matched: false,
      reason: "missing required fields for arithmetic validation",
    };
  }

  // All values must be numeric for arithmetic
  if (
    !fieldValues.every((v) => typeof v === "number") ||
    typeof equalsValue !== "number"
  ) {
    return {
      rule: rule.name,
      attachmentValues: [],
      matched: false,
      reason: "arithmetic validation requires numeric values",
    };
  }

  const numericFields = fieldValues as number[];
  const numericEquals = equalsValue as number;

  // Calculate result based on operation
  let calculated: number;
  switch (operation) {
    case "sum":
      calculated = numericFields.reduce((acc, val) => acc + val, 0);
      break;
    case "difference":
      calculated = numericFields.reduce((acc, val, i) =>
        i === 0 ? val : acc - val,
      );
      break;
    case "product":
      calculated = numericFields.reduce((acc, val) => acc * val, 1);
      break;
    default:
      return {
        rule: rule.name,
        attachmentValues: [],
        matched: false,
        reason: `Unknown operation: ${operation}`,
      };
  }

  // Compare with tolerance if operator is 'approximately'
  if (operator === "approximately") {
    const result = matchesWithTolerance(
      calculated,
      numericEquals,
      rule.tolerance,
    );
    return {
      rule: rule.name,
      primaryValue: numericEquals,
      attachmentValues: [calculated],
      matched: result.matched,
      matchType: result.matched ? "within-tolerance" : "exact",
      tolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
      reason: result.matched
        ? undefined
        : `arithmetic result ${calculated} does not match expected ${numericEquals}`,
      details: {
        actualDelta: result.delta,
        allowedTolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
      },
    };
  }

  // Exact equality
  const matched = calculated === numericEquals;
  return {
    rule: rule.name,
    primaryValue: numericEquals,
    attachmentValues: [calculated],
    matched,
    matchType: "exact",
    reason: matched
      ? undefined
      : `arithmetic result ${calculated} does not match expected ${numericEquals}`,
  };
}

function validateArrayMatch(
  rule: ValidationRule,
  primary: Record<string, unknown>,
  attachments: Array<Record<string, unknown>>,
): ValidationResultEntry {
  if (!rule.primaryFields || !rule.attachmentFields) {
    return {
      rule: rule.name,
      attachmentValues: [],
      matched: false,
      reason: "array-match rule requires primaryFields and attachmentFields",
    };
  }

  const operator = rule.operator ?? "equals";
  const fieldType = rule.fieldType ?? "text";
  const matchType = rule.matchType ?? "all";

  // Collect all primary values (handle both scalar and array fields)
  const primaryValues: (string | number)[] = [];
  for (const fieldPath of rule.primaryFields) {
    const rawValue = resolveField(primary, fieldPath);
    if (Array.isArray(rawValue)) {
      // Handle arrays within fields
      for (const item of rawValue) {
        const normalized = normalizeValue(item, fieldType);
        if (normalized !== undefined) {
          primaryValues.push(normalized);
        }
      }
    } else {
      const normalized = normalizeValue(rawValue, fieldType);
      if (normalized !== undefined) {
        primaryValues.push(normalized);
      }
    }
  }

  // Collect all attachment values from all attachments (handle both scalar and array fields)
  const attachmentValues: (string | number)[] = [];
  for (const attachment of attachments) {
    for (const fieldPath of rule.attachmentFields) {
      const rawValue = resolveField(attachment, fieldPath);
      if (Array.isArray(rawValue)) {
        // Handle arrays within fields
        for (const item of rawValue) {
          const normalized = normalizeValue(item, fieldType);
          if (normalized !== undefined) {
            attachmentValues.push(normalized);
          }
        }
      } else {
        const normalized = normalizeValue(rawValue, fieldType);
        if (normalized !== undefined) {
          attachmentValues.push(normalized);
        }
      }
    }
  }

  if (primaryValues.length === 0) {
    return {
      rule: rule.name,
      attachmentValues,
      matched: false,
      reason: "no primary values found",
    };
  }

  if (attachmentValues.length === 0) {
    return {
      rule: rule.name,
      primaryValue: primaryValues[0],
      attachmentValues: [],
      matched: false,
      reason: "no attachment values found",
    };
  }

  // Find matches
  let matchedCount = 0;
  for (const primaryValue of primaryValues) {
    let foundMatch = false;

    for (const attachmentValue of attachmentValues) {
      if (
        operator === "approximately" &&
        typeof primaryValue === "number" &&
        typeof attachmentValue === "number"
      ) {
        const result = matchesWithTolerance(
          primaryValue,
          attachmentValue,
          rule.tolerance,
        );
        if (result.matched) {
          foundMatch = true;
          break;
        }
      } else if (
        typeof primaryValue === "string" &&
        typeof attachmentValue === "string"
      ) {
        if (primaryValue.toLowerCase() === attachmentValue.toLowerCase()) {
          foundMatch = true;
          break;
        }
      } else if (primaryValue === attachmentValue) {
        foundMatch = true;
        break;
      }
    }

    if (foundMatch) {
      matchedCount += 1;
    }
  }

  const matched =
    matchType === "all"
      ? matchedCount === primaryValues.length
      : matchedCount > 0;

  return {
    rule: rule.name,
    primaryValue: primaryValues[0],
    attachmentValues,
    matched,
    matchType: matched ? "partial" : "exact",
    tolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
    reason: matched
      ? undefined
      : `${matchedCount} of ${primaryValues.length} primary values found in attachments`,
  };
}
