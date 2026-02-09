export interface ValidationRule {
  name: string;
  type: 'field-match' | 'arithmetic' | 'array-match';

  // For field-match type
  primaryField?: string;
  attachmentField?: string;

  // For arithmetic type (e.g., net = gross - deductions)
  expression?: {
    operation: 'sum' | 'difference' | 'product';
    fields: string[];
    equals: string;
  };

  // For array-match type (e.g., find Page 1 amounts in Page 3 deposits)
  primaryFields?: string[];
  attachmentFields?: string[];
  matchType?: 'any' | 'all';

  // Common options
  operator?: 'equals' | 'approximately';
  tolerance?: {
    amount?: number;      // Absolute tolerance (e.g., 0.05 for ±$0.05)
    percentage?: number;  // Percentage tolerance (e.g., 1 for ±1%)
  };
  fieldType?: 'text' | 'number' | 'currency';
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
  matchType?: 'exact' | 'within-tolerance' | 'partial';
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

export async function validateDocumentFields(
  input: DocumentValidateFieldsInput,
): Promise<DocumentValidateFieldsOutput> {
  const rules = input.rules && input.rules.length > 0 ? input.rules : DEFAULT_RULES;
  const primary = input.processedSegments[0] ?? {};
  const attachments = input.processedSegments.slice(1);

  const entries: ValidationResultEntry[] = rules.map((rule) => {
    // Route to appropriate validator based on rule type
    switch (rule.type) {
      case 'field-match':
        return validateFieldMatch(rule, primary, attachments);
      case 'arithmetic':
        return validateArithmetic(rule, primary);
      case 'array-match':
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
  if (value === null || value === undefined) {
    return undefined;
  }

  let str: string;
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    str = value;
  } else {
    str = String(value);
  }

  // Remove currency symbols, commas, and whitespace
  const cleaned = str.replace(/[$,\s]/g, '').trim();
  const num = Number(cleaned);

  return Number.isFinite(num) ? num : undefined;
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

function normalizeValue(value: unknown, fieldType?: string): string | number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (fieldType === 'currency' || fieldType === 'number') {
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

  const operator = rule.operator ?? 'equals';
  const fieldType = rule.fieldType ?? 'text';

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
    operator === 'approximately' &&
    typeof primaryValue === 'number' &&
    attachmentValues.every((v) => typeof v === 'number')
  ) {
    const numericAttachments = attachmentValues as number[];
    const allMatch = numericAttachments.every((attachValue) => {
      const result = matchesWithTolerance(primaryValue, attachValue, rule.tolerance);
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
      matchType: allMatch ? 'within-tolerance' : 'exact',
      tolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
      reason: allMatch ? undefined : "attachment mismatch",
      details: {
        actualDelta: maxDelta,
        allowedTolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
      },
    };
  }

  // String comparison
  if (typeof primaryValue === 'string') {
    const matched = attachmentValues.every(
      (value) =>
        typeof value === 'string' &&
        value.toLowerCase() === primaryValue.toLowerCase(),
    );

    return {
      rule: rule.name,
      primaryValue,
      attachmentValues,
      matched,
      matchType: 'exact',
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
    matchType: 'exact',
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
  const operator = rule.operator ?? 'equals';
  const fieldType = rule.fieldType ?? 'number';

  // Resolve all field values
  const fieldValues = fields.map((fieldPath) =>
    normalizeValue(resolveField(primary, fieldPath), fieldType),
  );

  const equalsValue = normalizeValue(resolveField(primary, equalsField), fieldType);

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
    !fieldValues.every((v) => typeof v === 'number') ||
    typeof equalsValue !== 'number'
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
    case 'sum':
      calculated = numericFields.reduce((acc, val) => acc + val, 0);
      break;
    case 'difference':
      calculated = numericFields.reduce((acc, val, i) =>
        i === 0 ? val : acc - val,
      );
      break;
    case 'product':
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
  if (operator === 'approximately') {
    const result = matchesWithTolerance(calculated, numericEquals, rule.tolerance);
    return {
      rule: rule.name,
      primaryValue: numericEquals,
      attachmentValues: [calculated],
      matched: result.matched,
      matchType: result.matched ? 'within-tolerance' : 'exact',
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
    matchType: 'exact',
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

  const operator = rule.operator ?? 'equals';
  const fieldType = rule.fieldType ?? 'text';
  const matchType = rule.matchType ?? 'all';

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
        operator === 'approximately' &&
        typeof primaryValue === 'number' &&
        typeof attachmentValue === 'number'
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
        typeof primaryValue === 'string' &&
        typeof attachmentValue === 'string'
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
    matchType === 'all'
      ? matchedCount === primaryValues.length
      : matchedCount > 0;

  return {
    rule: rule.name,
    primaryValue: primaryValues[0],
    attachmentValues,
    matched,
    matchType: matched ? 'partial' : 'exact',
    tolerance: rule.tolerance?.amount ?? rule.tolerance?.percentage,
    reason: matched
      ? undefined
      : `${matchedCount} of ${primaryValues.length} primary values found in attachments`,
  };
}
