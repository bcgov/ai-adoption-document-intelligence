export interface ValidationRule {
  name: string;
  primaryField: string;
  attachmentField: string;
}

export interface DocumentValidateFieldsInput {
  processedSegments: Array<Record<string, unknown>>;
  documentId: string;
  rules?: ValidationRule[];
}

export interface ValidationResultEntry {
  rule: string;
  primaryValue?: string;
  attachmentValues: string[];
  matched: boolean;
  reason?: string;
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

const DEFAULT_RULES: ValidationRule[] = [
  {
    name: "invoice-number",
    primaryField: "invoiceNumber",
    attachmentField: "invoiceNumber",
  },
  {
    name: "vendor-name",
    primaryField: "vendorName",
    attachmentField: "vendorName",
  },
  {
    name: "total-amount",
    primaryField: "totalAmount",
    attachmentField: "totalAmount",
  },
];

export async function validateDocumentFields(
  input: DocumentValidateFieldsInput,
): Promise<DocumentValidateFieldsOutput> {
  const rules = input.rules && input.rules.length > 0 ? input.rules : DEFAULT_RULES;
  const primary = input.processedSegments[0] ?? {};
  const attachments = input.processedSegments.slice(1);

  const entries: ValidationResultEntry[] = rules.map((rule) => {
    const primaryValue = normalizeValue(resolveField(primary, rule.primaryField));
    const attachmentValues = attachments
      .map((segment) => normalizeValue(resolveField(segment, rule.attachmentField)))
      .filter((value): value is string => value !== undefined);

    if (!primaryValue) {
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

    const matched = attachmentValues.every(
      (value) => value.toLowerCase() === primaryValue.toLowerCase(),
    );

    return {
      rule: rule.name,
      primaryValue,
      attachmentValues,
      matched,
      reason: matched ? undefined : "attachment mismatch",
    };
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

function normalizeValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return JSON.stringify(value);
}
