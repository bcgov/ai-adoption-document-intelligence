# Field Format Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared field format engine that normalizes OCR field values based on user-defined format specs, integrates with the existing normalizeFields activity, and provides advisory validation in the HITL correction UI.

**Architecture:** Format specs are stored as JSON in the existing `FieldDefinition.field_format` column. A pure-function `field-format-engine.ts` module provides `canonicalize()`, `validate()`, and `format()` functions consumed by the Temporal normalizeFields activity (server-side normalization) and the frontend HITL page (client-side validation). The FieldSchemaEditor gets a format spec editor UI.

**Tech Stack:** TypeScript (shared pure functions), NestJS (backend), Mantine UI + @mantine/form (frontend), Jest (backend/temporal tests), Vitest (frontend tests)

**Spec:** `docs/superpowers/specs/2026-04-04-field-format-engine-design.md` — Sections 1 (Field Format Engine), 5 (HITL Validation), and relevant parts of Template Model UI.

**Part of:** This is Plan A of 3. Plan B covers Confusion Profiles. Plan C covers AI Format Suggestion + AI Content Recommendation changes.

---

### Task 1: Field Format Engine — Core Module

**Files:**
- Create: `apps/temporal/src/field-format-engine.ts`
- Create: `apps/temporal/src/field-format-engine.test.ts`

- [ ] **Step 1: Write failing tests for parseFormatSpec**

```typescript
// apps/temporal/src/field-format-engine.test.ts
import {
  parseFormatSpec,
  canonicalize,
  validate,
  format,
  type FormatSpec,
} from "./field-format-engine";

describe("parseFormatSpec", () => {
  it("returns null for null input", () => {
    expect(parseFormatSpec(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFormatSpec("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseFormatSpec("not json")).toBeNull();
  });

  it("returns null when canonicalize is missing", () => {
    expect(parseFormatSpec('{"pattern": "^\\\\d+$"}')).toBeNull();
  });

  it("parses a simple digits spec", () => {
    const spec = parseFormatSpec(
      '{"canonicalize": "digits", "pattern": "^\\\\d{9}$"}',
    );
    expect(spec).toEqual({
      canonicalize: "digits",
      pattern: "^\\d{9}$",
    });
  });

  it("parses a spec with displayTemplate", () => {
    const spec = parseFormatSpec(
      '{"canonicalize": "digits", "pattern": "^\\\\d{9,10}$", "displayTemplate": "(###) ###-###"}',
    );
    expect(spec).toEqual({
      canonicalize: "digits",
      pattern: "^\\d{9,10}$",
      displayTemplate: "(###) ###-###",
    });
  });

  it("parses a composable canonicalize spec", () => {
    const spec = parseFormatSpec(
      '{"canonicalize": "uppercase|strip-spaces", "pattern": "^[A-Z]\\\\d[A-Z]\\\\d[A-Z]\\\\d$"}',
    );
    expect(spec).toEqual({
      canonicalize: "uppercase|strip-spaces",
      pattern: "^[A-Z]\\d[A-Z]\\d[A-Z]\\d$",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/temporal && npx jest field-format-engine --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement parseFormatSpec**

```typescript
// apps/temporal/src/field-format-engine.ts

export interface FormatSpec {
  canonicalize: string;
  pattern?: string;
  displayTemplate?: string;
}

/**
 * Parse a JSON-encoded field_format string into a FormatSpec.
 * Returns null if the input is null, empty, invalid JSON, or missing required fields.
 */
export function parseFormatSpec(raw: string | null): FormatSpec | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof parsed.canonicalize !== "string" || !parsed.canonicalize.trim()) {
    return null;
  }

  const spec: FormatSpec = {
    canonicalize: parsed.canonicalize.trim(),
  };

  if (typeof parsed.pattern === "string" && parsed.pattern.trim()) {
    spec.pattern = parsed.pattern;
  }

  if (
    typeof parsed.displayTemplate === "string" &&
    parsed.displayTemplate.trim()
  ) {
    spec.displayTemplate = parsed.displayTemplate;
  }

  return spec;
}
```

- [ ] **Step 4: Run tests to verify parseFormatSpec passes**

Run: `cd apps/temporal && npx jest field-format-engine --no-coverage`
Expected: parseFormatSpec tests PASS, canonicalize/validate/format tests FAIL (not yet implemented)

- [ ] **Step 5: Write failing tests for canonicalize**

Add to `apps/temporal/src/field-format-engine.test.ts`:

```typescript
describe("canonicalize", () => {
  it("digits: strips non-digit characters", () => {
    expect(canonicalize("872 318 748", { canonicalize: "digits" })).toBe(
      "872318748",
    );
    expect(canonicalize("872-318-748", { canonicalize: "digits" })).toBe(
      "872318748",
    );
    expect(canonicalize("(442) 836-849", { canonicalize: "digits" })).toBe(
      "442836849",
    );
  });

  it("uppercase: converts to uppercase", () => {
    expect(canonicalize("a1b2c3", { canonicalize: "uppercase" })).toBe(
      "A1B2C3",
    );
  });

  it("lowercase: converts to lowercase", () => {
    expect(canonicalize("Need Look", { canonicalize: "lowercase" })).toBe(
      "need look",
    );
  });

  it("strip-spaces: removes all whitespace", () => {
    expect(
      canonicalize("872 318 748", { canonicalize: "strip-spaces" }),
    ).toBe("872318748");
    expect(
      canonicalize("A1B 2C3\tD4", { canonicalize: "strip-spaces" }),
    ).toBe("A1B2C3D4");
  });

  it("text: collapses whitespace, trims, removes space before punctuation", () => {
    expect(
      canonicalize("chair . Work", { canonicalize: "text" }),
    ).toBe("chair. Work");
    expect(
      canonicalize("avoid various .", { canonicalize: "text" }),
    ).toBe("avoid various.");
    expect(
      canonicalize("  hello   world  ", { canonicalize: "text" }),
    ).toBe("hello world");
  });

  it("number: strips currency symbols, commas, spaces from numeric string", () => {
    expect(canonicalize("$1,234.56", { canonicalize: "number" })).toBe(
      "1234.56",
    );
    expect(canonicalize("€ 1 234.56", { canonicalize: "number" })).toBe(
      "1234.56",
    );
    expect(canonicalize("7:20.24", { canonicalize: "number" })).toBe(
      "7:20.24",
    );
  });

  it("date:YYYY-MM-DD: parses various date formats to ISO", () => {
    expect(
      canonicalize("2009-Apr-22", { canonicalize: "date:YYYY-MM-DD" }),
    ).toBe("2009-04-22");
    expect(
      canonicalize("26-01-2019", { canonicalize: "date:YYYY-MM-DD" }),
    ).toBe("2019-01-26");
    expect(
      canonicalize("08/18/2008", { canonicalize: "date:YYYY-MM-DD" }),
    ).toBe("2008-08-18");
    expect(
      canonicalize("2024- Apr- 30", { canonicalize: "date:YYYY-MM-DD" }),
    ).toBe("2024-04-30");
    expect(
      canonicalize("2023-01-09", { canonicalize: "date:YYYY-MM-DD" }),
    ).toBe("2023-01-09");
  });

  it("date:YYYY-MM-DD: returns original value if unparseable", () => {
    expect(
      canonicalize("not a date", { canonicalize: "date:YYYY-MM-DD" }),
    ).toBe("not a date");
  });

  it("noop: returns value unchanged", () => {
    expect(canonicalize("anything", { canonicalize: "noop" })).toBe(
      "anything",
    );
  });

  it("composable: uppercase|strip-spaces chains operations left to right", () => {
    expect(
      canonicalize("a1b 2c3", { canonicalize: "uppercase|strip-spaces" }),
    ).toBe("A1B2C3");
  });

  it("composable: lowercase|text chains operations", () => {
    expect(
      canonicalize("  Hello   World .  ", {
        canonicalize: "lowercase|text",
      }),
    ).toBe("hello world.");
  });

  it("returns empty string unchanged", () => {
    expect(canonicalize("", { canonicalize: "digits" })).toBe("");
  });
});
```

- [ ] **Step 6: Implement canonicalize**

Add to `apps/temporal/src/field-format-engine.ts`:

```typescript
import { parseToCalendarParts } from "./form-field-normalization";

function applyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function applyUppercase(value: string): string {
  return value.toUpperCase();
}

function applyLowercase(value: string): string {
  return value.toLowerCase();
}

function applyStripSpaces(value: string): string {
  return value.replace(/\s/g, "");
}

function applyText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
}

function applyNumber(value: string): string {
  return value.replace(/[£$€¥,\s]/g, "");
}

function applyDate(value: string, outputFormat: string): string {
  const cleaned = value.replace(/\s*-\s*/g, "-").replace(/\s*\/\s*/g, "/").trim();
  const parts = parseToCalendarParts(cleaned);
  if (!parts) return value;
  const mm = String(parts.m).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  switch (outputFormat) {
    case "YYYY-MM-DD":
      return `${parts.y}-${mm}-${dd}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${parts.y}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${parts.y}`;
    default:
      return `${parts.y}-${mm}-${dd}`;
  }
}

const OPERATION_MAP: Record<string, (value: string) => string> = {
  digits: applyDigits,
  uppercase: applyUppercase,
  lowercase: applyLowercase,
  "strip-spaces": applyStripSpaces,
  text: applyText,
  number: applyNumber,
  noop: (v) => v,
};

/**
 * Apply canonicalization operations to a value.
 * Operations are chainable with `|` and run left to right.
 * `date:FORMAT` is a special operation that parses and reformats dates.
 */
export function canonicalize(value: string, spec: FormatSpec): string {
  if (!value) return value;

  const operations = spec.canonicalize.split("|").map((op) => op.trim());
  let result = value;

  for (const op of operations) {
    if (op.startsWith("date:")) {
      const outputFormat = op.slice(5);
      result = applyDate(result, outputFormat);
    } else {
      const fn = OPERATION_MAP[op];
      if (fn) {
        result = fn(result);
      }
    }
  }

  return result;
}
```

- [ ] **Step 7: Run tests to verify canonicalize passes**

Run: `cd apps/temporal && npx jest field-format-engine --no-coverage`
Expected: parseFormatSpec + canonicalize tests PASS

- [ ] **Step 8: Write failing tests for validate and format**

Add to `apps/temporal/src/field-format-engine.test.ts`:

```typescript
describe("validate", () => {
  it("returns valid when no pattern is set", () => {
    expect(
      validate("anything", { canonicalize: "text" }),
    ).toEqual({ valid: true });
  });

  it("validates canonicalized value against pattern", () => {
    const spec: FormatSpec = {
      canonicalize: "digits",
      pattern: "^\\d{9}$",
    };
    expect(validate("872 318 748", spec)).toEqual({ valid: true });
    expect(validate("12345", spec)).toEqual({
      valid: false,
      message: expect.stringContaining("pattern"),
    });
  });

  it("validates postal code format", () => {
    const spec: FormatSpec = {
      canonicalize: "uppercase|strip-spaces",
      pattern: "^[A-Z]\\d[A-Z]\\d[A-Z]\\d$",
    };
    expect(validate("V8W 1N3", spec)).toEqual({ valid: true });
    expect(validate("12345", spec)).toEqual({
      valid: false,
      message: expect.stringContaining("pattern"),
    });
  });

  it("returns valid for empty string (no value to validate)", () => {
    const spec: FormatSpec = {
      canonicalize: "digits",
      pattern: "^\\d{9}$",
    };
    expect(validate("", spec)).toEqual({ valid: true });
  });
});

describe("format", () => {
  it("canonicalizes without displayTemplate", () => {
    const spec: FormatSpec = { canonicalize: "digits" };
    expect(format("872 318 748", spec)).toBe("872318748");
  });

  it("applies displayTemplate with # placeholders for digits", () => {
    const spec: FormatSpec = {
      canonicalize: "digits",
      displayTemplate: "(###) ###-###",
    };
    expect(format("442-836-849", spec)).toBe("(442) 836-849");
  });

  it("applies displayTemplate with A placeholders for letters", () => {
    const spec: FormatSpec = {
      canonicalize: "uppercase|strip-spaces",
      displayTemplate: "A#A#A#",
    };
    expect(format("v8w 1n3", spec)).toBe("V8W1N3");
  });

  it("returns canonicalized value if template has more placeholders than value chars", () => {
    const spec: FormatSpec = {
      canonicalize: "digits",
      displayTemplate: "(###) ###-####",
    };
    // Only 9 digits but template expects 10 — return canonicalized value without template
    expect(format("442836849", spec)).toBe("442836849");
  });

  it("returns canonicalized value if no displayTemplate", () => {
    const spec: FormatSpec = { canonicalize: "date:YYYY-MM-DD" };
    expect(format("2009-Apr-22", spec)).toBe("2009-04-22");
  });
});
```

- [ ] **Step 9: Implement validate and format**

Add to `apps/temporal/src/field-format-engine.ts`:

```typescript
/**
 * Validate a value against a format spec.
 * Canonicalizes the value first, then tests against the pattern regex.
 * Returns { valid: true } if no pattern is set or value is empty.
 */
export function validate(
  value: string,
  spec: FormatSpec,
): { valid: boolean; message?: string } {
  if (!value) return { valid: true };
  if (!spec.pattern) return { valid: true };

  const canonicalized = canonicalize(value, spec);
  const regex = new RegExp(spec.pattern);
  if (regex.test(canonicalized)) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Value does not match expected pattern`,
  };
}

/**
 * Apply display template to a canonicalized value.
 * '#' = digit placeholder, 'A' = letter placeholder.
 * All other characters in the template are literal.
 * Returns the canonicalized value without template if placeholder count doesn't match.
 */
function applyDisplayTemplate(
  canonicalized: string,
  template: string,
): string {
  const placeholderCount = (template.match(/[#A]/g) || []).length;
  if (canonicalized.length !== placeholderCount) {
    return canonicalized;
  }

  let charIndex = 0;
  let result = "";
  for (const ch of template) {
    if (ch === "#" || ch === "A") {
      result += canonicalized[charIndex];
      charIndex++;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Full format pipeline: canonicalize + apply displayTemplate.
 * Use this for OCR normalization output.
 */
export function format(value: string, spec: FormatSpec): string {
  if (!value) return value;
  const canonicalized = canonicalize(value, spec);
  if (spec.displayTemplate) {
    return applyDisplayTemplate(canonicalized, spec.displayTemplate);
  }
  return canonicalized;
}
```

- [ ] **Step 10: Run all tests to verify everything passes**

Run: `cd apps/temporal && npx jest field-format-engine --no-coverage`
Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add apps/temporal/src/field-format-engine.ts apps/temporal/src/field-format-engine.test.ts
git commit -m "feat: add field format engine core module

Shared pure-function module for format spec parsing, canonicalization,
validation, and formatting. Supports chainable operations (digits,
uppercase, lowercase, strip-spaces, text, number, date:FORMAT, noop)
with optional regex pattern validation and display templates."
```

---

### Task 2: Integrate Format Engine into normalizeFields Activity

**Files:**
- Modify: `apps/temporal/src/activities/ocr-normalize-fields.ts`
- Modify: `apps/temporal/src/activities/ocr-normalize-fields.test.ts`
- Read: `apps/temporal/src/activities/field-schema-loader.ts` (for FieldMap structure)

- [ ] **Step 1: Write failing test for format-spec-driven normalization**

Add to `apps/temporal/src/activities/ocr-normalize-fields.test.ts`:

```typescript
import * as fieldSchemaLoader from "./field-schema-loader";

// In the describe block that tests schema-aware normalization, add:
describe("format-spec-driven normalization", () => {
  beforeEach(() => {
    jest.spyOn(fieldSchemaLoader, "loadFieldMapFromProject").mockResolvedValue({
      sin: { type: "string", format: '{"canonicalize": "digits", "pattern": "^\\\\d{9}$"}' },
      phone: {
        type: "string",
        format:
          '{"canonicalize": "digits", "displayTemplate": "(###) ###-###"}',
      },
      date: { type: "date", format: '{"canonicalize": "date:YYYY-MM-DD"}' },
      explain_changes: { type: "string", format: '{"canonicalize": "text"}' },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("normalizes SIN field using digits canonicalization", async () => {
    const result = await normalizeOcrFields({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              sin: { content: "872 318 748", valueString: "872 318 748" },
            },
          },
        ],
      },
      documentType: "test-template-model-id",
    });
    const sinField = result.ocrResult.documents![0].fields.sin as {
      content: string;
    };
    expect(sinField.content).toBe("872318748");
  });

  it("normalizes phone field with displayTemplate", async () => {
    const result = await normalizeOcrFields({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              phone: { content: "442-836-849", valueString: "442-836-849" },
            },
          },
        ],
      },
      documentType: "test-template-model-id",
    });
    const phoneField = result.ocrResult.documents![0].fields.phone as {
      content: string;
    };
    expect(phoneField.content).toBe("(442) 836-849");
  });

  it("normalizes date field to ISO format", async () => {
    const result = await normalizeOcrFields({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              date: { content: "2009-Apr-22", valueString: "2009-Apr-22" },
            },
          },
        ],
      },
      documentType: "test-template-model-id",
    });
    const dateField = result.ocrResult.documents![0].fields.date as {
      content: string;
    };
    expect(dateField.content).toBe("2009-04-22");
  });

  it("normalizes text field whitespace and punctuation", async () => {
    const result = await normalizeOcrFields({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              explain_changes: {
                content: "avoid various .",
                valueString: "avoid various .",
              },
            },
          },
        ],
      },
      documentType: "test-template-model-id",
    });
    const field = result.ocrResult.documents![0].fields.explain_changes as {
      content: string;
    };
    expect(field.content).toBe("avoid various.");
  });

  it("falls back to heuristic normalization when field has no format spec", async () => {
    jest
      .spyOn(fieldSchemaLoader, "loadFieldMapFromProject")
      .mockResolvedValue({
        other_field: { type: "string" },
      });
    // This should still use existing heuristics — no format spec, no change to behavior
    const result = await normalizeOcrFields({
      ocrResult: {
        ...baseOcrResult,
        documents: [
          {
            fields: {
              other_field: {
                content: "  hello  world  ",
                valueString: "  hello  world  ",
              },
            },
          },
        ],
      },
      documentType: "test-template-model-id",
    });
    const field = result.ocrResult.documents![0].fields.other_field as {
      content: string;
    };
    expect(field.content).toBe("hello world");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/temporal && npx jest ocr-normalize-fields --no-coverage`
Expected: New tests FAIL (format engine not wired in yet)

- [ ] **Step 3: Update FieldMap type to include format string**

The `FieldMap` in `enrichment-rules.ts` already has `format?: string` and `field-schema-loader.ts` already loads `field_format`. Verify this by reading both files — no code change needed if already present. The format string flows through as `fieldMap[fieldKey].format`.

- [ ] **Step 4: Modify normalizeOcrFields to use format engine**

In `apps/temporal/src/activities/ocr-normalize-fields.ts`, add the import and modify `applyNormalization`:

```typescript
// Add at top of file:
import { format as formatFieldValue, parseFormatSpec } from "../field-format-engine";

// Inside the applyNormalization function, add format-spec-driven path before existing logic:
const applyNormalization = (fieldKey: string, value: string): string => {
  if (!value || typeof value !== "string") return value;
  const inScope = isFieldInScope(fieldKey, fieldScope);
  const schemaRow = fieldMap?.[fieldKey];

  // Format-spec-driven normalization: takes precedence when available
  if (schemaRow?.format) {
    const spec = parseFormatSpec(schemaRow.format);
    if (spec) {
      // Apply base unicode + whitespace cleanup first
      let out = normalizeUnicode(value);
      out = normalizeWhitespace(out);
      // Then apply format engine
      const formatted = formatFieldValue(out, spec);
      if (formatted !== value) {
        changes.push({
          fieldKey,
          originalValue: value,
          correctedValue: formatted,
          reason: `Format spec canonicalization (${spec.canonicalize})`,
          source: "rule",
        });
      }
      return formatted;
    }
  }

  // Existing heuristic-based normalization (fallback)
  const rulesThisField =
    fieldMap && schemaRow
      ? rulesForSchemaField(rules, schemaRow.type)
      : rules;

  let out: string;
  if (!fieldMap) {
    if (inScope) {
      out = applyRules(value, fieldKey, rules, changes);
    } else if (looksLikeNumericOrMoney(value)) {
      out = applyRules(value, fieldKey, rules, changes, true);
    } else {
      out = value;
    }
  } else {
    if (inScope) {
      out = applyRules(value, fieldKey, rulesThisField, changes);
    } else if (looksLikeNumericOrMoney(value)) {
      out = applyRules(value, fieldKey, rules, changes, true);
    } else {
      out = value;
    }
  }

  const runSemantic =
    inScope ||
    isIdentifierLikeFieldKey(fieldKey) ||
    isDateLikeFieldKey(fieldKey) ||
    (fieldMap && schemaRow?.type === "date");
  if (runSemantic) {
    out = applySemanticFieldShape(fieldKey, out, changes, schemaRow?.type);
  }
  return out;
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/temporal && npx jest ocr-normalize-fields --no-coverage`
Expected: ALL PASS (new format-spec tests + existing tests)

- [ ] **Step 6: Run full temporal test suite to check for regressions**

Run: `cd apps/temporal && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add apps/temporal/src/activities/ocr-normalize-fields.ts apps/temporal/src/activities/ocr-normalize-fields.test.ts
git commit -m "feat: integrate field format engine into normalizeFields activity

When a field has a field_format spec in the schema, the format engine's
canonicalize + displayTemplate pipeline takes precedence over the
heuristic-based normalization. Fields without format specs fall back
to existing behavior (unchanged)."
```

---

### Task 3: Template Model UI — Format Spec Editor

**Files:**
- Modify: `apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.tsx`

- [ ] **Step 1: Read the current FieldSchemaEditor.tsx**

Read `apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.tsx` fully to understand the current structure (Modal with field_key TextInput, field_type Select, field_format TextInput, Cancel/Save buttons).

- [ ] **Step 2: Update FieldSchemaEditor with format spec UI**

Replace the plain `field_format` TextInput with a structured format spec editor. The editor has:
- A `Select` dropdown for canonicalize presets ("Digits only", "Date (ISO)", "Text", "Number", "No operation", "Custom")
- When "Custom" is selected: a `TextInput` for the raw canonicalize string (for composable operations like `uppercase|strip-spaces`)
- A `TextInput` for the regex pattern (optional)
- A `TextInput` for displayTemplate (optional)
- The `onSubmit` serializes these fields into a JSON string for `field_format`

```typescript
// Canonicalize preset options
const CANONICALIZE_PRESETS = [
  { value: "digits", label: "Digits only" },
  { value: "date:YYYY-MM-DD", label: "Date (ISO)" },
  { value: "text", label: "Text (clean whitespace)" },
  { value: "number", label: "Number" },
  { value: "noop", label: "No operation" },
  { value: "__custom__", label: "Custom..." },
];

// State:
const [canonicalizePreset, setCanonicalizePreset] = useState("noop");
const [customCanonicalize, setCustomCanonicalize] = useState("");
const [formatPattern, setFormatPattern] = useState("");
const [displayTemplate, setDisplayTemplate] = useState("");

// On open, parse existing field_format JSON into the individual fields.
// On submit, serialize back to JSON:
const buildFieldFormat = (): string | undefined => {
  const canonicalize =
    canonicalizePreset === "__custom__" ? customCanonicalize : canonicalizePreset;
  if (!canonicalize || canonicalize === "noop") return undefined;
  const spec: Record<string, string> = { canonicalize };
  if (formatPattern.trim()) spec.pattern = formatPattern.trim();
  if (displayTemplate.trim()) spec.displayTemplate = displayTemplate.trim();
  return JSON.stringify(spec);
};
```

- [ ] **Step 3: Verify the editor works by running the frontend dev server**

Run: `cd apps/frontend && npm run dev`
Navigate to a template model, open the field editor, verify the new format spec fields appear and serialize correctly on save.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/annotation/template-models/components/FieldSchemaEditor.tsx
git commit -m "feat: add format spec editor to FieldSchemaEditor

Adds structured UI for field_format: canonicalize preset dropdown,
optional regex pattern, optional display template. Custom mode allows
composable operations like 'uppercase|strip-spaces'. Serializes to
JSON in field_format column."
```

---

### Task 4: HITL Validation — Format-Aware Correction Inputs

**Files:**
- Create: `apps/frontend/src/features/annotation/hitl/utils/format-validation.ts`
- Create: `apps/frontend/src/features/annotation/hitl/utils/format-validation.test.ts`
- Modify: `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx`

- [ ] **Step 1: Write failing tests for format validation utility**

```typescript
// apps/frontend/src/features/annotation/hitl/utils/format-validation.test.ts
import { describe, it, expect } from "vitest";
import {
  parseFormatSpec,
  validateFieldValue,
  buildFieldValidators,
} from "./format-validation";

describe("parseFormatSpec", () => {
  it("returns null for null/empty", () => {
    expect(parseFormatSpec(null)).toBeNull();
    expect(parseFormatSpec("")).toBeNull();
  });

  it("parses valid JSON spec", () => {
    expect(
      parseFormatSpec('{"canonicalize": "digits", "pattern": "^\\\\d{9}$"}'),
    ).toEqual({ canonicalize: "digits", pattern: "^\\d{9}$" });
  });
});

describe("validateFieldValue", () => {
  it("returns null (no error) when value matches format", () => {
    const spec = { canonicalize: "digits", pattern: "^\\d{9}$" };
    expect(validateFieldValue("872 318 748", spec)).toBeNull();
  });

  it("returns error message when value does not match", () => {
    const spec = { canonicalize: "digits", pattern: "^\\d{9}$" };
    expect(validateFieldValue("12345", spec)).toBe(
      "Value does not match expected pattern",
    );
  });

  it("returns null for empty value", () => {
    const spec = { canonicalize: "digits", pattern: "^\\d{9}$" };
    expect(validateFieldValue("", spec)).toBeNull();
  });

  it("returns null when no pattern defined", () => {
    const spec = { canonicalize: "text" };
    expect(validateFieldValue("anything", spec)).toBeNull();
  });
});

describe("buildFieldValidators", () => {
  it("builds validators map from field definitions", () => {
    const fieldDefs = [
      {
        field_key: "sin",
        field_format: '{"canonicalize": "digits", "pattern": "^\\\\d{9}$"}',
      },
      { field_key: "name", field_format: null },
    ];
    const validators = buildFieldValidators(fieldDefs);
    expect(validators.sin).toBeDefined();
    expect(validators.name).toBeUndefined();
    expect(validators.sin!("872 318 748")).toBeNull();
    expect(validators.sin!("12345")).toBe(
      "Value does not match expected pattern",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/annotation/hitl/utils/format-validation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement format validation utility**

```typescript
// apps/frontend/src/features/annotation/hitl/utils/format-validation.ts

/**
 * Field format validation for HITL correction inputs.
 *
 * Pure functions — no Node dependencies. Mirrors the canonicalize logic
 * from apps/temporal/src/field-format-engine.ts but kept as a lightweight
 * frontend copy to avoid cross-package import complexity.
 */

export interface FormatSpec {
  canonicalize: string;
  pattern?: string;
  displayTemplate?: string;
}

export function parseFormatSpec(raw: string | null): FormatSpec | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.canonicalize !== "string" || !parsed.canonicalize.trim())
    return null;
  const spec: FormatSpec = { canonicalize: parsed.canonicalize.trim() };
  if (typeof parsed.pattern === "string" && parsed.pattern.trim())
    spec.pattern = parsed.pattern;
  if (typeof parsed.displayTemplate === "string" && parsed.displayTemplate.trim())
    spec.displayTemplate = parsed.displayTemplate;
  return spec;
}

function applyCanonicalize(value: string, canonicalize: string): string {
  const ops = canonicalize.split("|").map((op) => op.trim());
  let result = value;
  for (const op of ops) {
    switch (op) {
      case "digits":
        result = result.replace(/\D/g, "");
        break;
      case "uppercase":
        result = result.toUpperCase();
        break;
      case "lowercase":
        result = result.toLowerCase();
        break;
      case "strip-spaces":
        result = result.replace(/\s/g, "");
        break;
      case "text":
        result = result
          .replace(/\s+/g, " ")
          .replace(/ +([.,;:!?])/g, "$1")
          .trim();
        break;
      case "number":
        result = result.replace(/[£$€¥,\s]/g, "");
        break;
      case "noop":
        break;
      default:
        if (op.startsWith("date:")) {
          // Date parsing is complex — skip validation for date fields
          // (the backend format engine handles normalization)
          break;
        }
    }
  }
  return result;
}

/**
 * Validate a field value against a format spec.
 * Returns null if valid, or an error message string if invalid.
 * Compatible with @mantine/form validator signature.
 */
export function validateFieldValue(
  value: string,
  spec: FormatSpec,
): string | null {
  if (!value) return null;
  if (!spec.pattern) return null;
  const canonicalized = applyCanonicalize(value, spec.canonicalize);
  const regex = new RegExp(spec.pattern);
  if (regex.test(canonicalized)) return null;
  return "Value does not match expected pattern";
}

/**
 * Build a map of field_key → validator function from field definitions.
 * Only fields with a parseable field_format that includes a pattern get validators.
 */
export function buildFieldValidators(
  fieldDefs: Array<{ field_key: string; field_format?: string | null }>,
): Record<string, ((value: string) => string | null) | undefined> {
  const validators: Record<
    string,
    ((value: string) => string | null) | undefined
  > = {};
  for (const fd of fieldDefs) {
    const spec = parseFormatSpec(fd.field_format ?? null);
    if (spec?.pattern) {
      validators[fd.field_key] = (value: string) =>
        validateFieldValue(value, spec);
    }
  }
  return validators;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/annotation/hitl/utils/format-validation.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit validation utility**

```bash
git add apps/frontend/src/features/annotation/hitl/utils/format-validation.ts apps/frontend/src/features/annotation/hitl/utils/format-validation.test.ts
git commit -m "feat: add format validation utility for HITL correction inputs

Pure-function module that parses field_format specs and validates
correction values. Compatible with @mantine/form validator signature.
Mirrors canonicalize logic from the Temporal field-format-engine."
```

- [ ] **Step 6: Read ReviewWorkspacePage.tsx to understand current field rendering**

Read `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` — focus on:
- How `correctionMap` state is structured (lines 169-177)
- How field inputs are rendered (lines 900-1010)
- How `handleFieldChange` works (lines 384-406)
- Whether field definitions with `field_format` are available in the component's data

- [ ] **Step 7: Wire validation into ReviewWorkspacePage correction inputs**

The key changes to `ReviewWorkspacePage.tsx`:

1. Import `buildFieldValidators` and call it when field definitions are available
2. Add validation state alongside `correctionMap`
3. On each field change, run the validator and show error on the Textarea

```typescript
// Add import:
import { buildFieldValidators } from "../utils/format-validation";

// Build validators from field definitions (useMemo near other state):
const fieldValidators = useMemo(() => {
  // fieldDefinitions should be available from the template model data
  // loaded for this review session. Check how the component gets field schema.
  if (!fieldDefinitions?.length) return {};
  return buildFieldValidators(fieldDefinitions);
}, [fieldDefinitions]);

// In the Textarea rendering section, add error prop:
<Textarea
  value={displayValue}
  onChange={(e) => handleFieldChange(field, e.currentTarget.value)}
  disabled={readOnly}
  autosize
  minRows={1}
  error={
    fieldValidators[field.fieldKey]
      ? fieldValidators[field.fieldKey]!(displayValue)
      : undefined
  }
/>
```

Note: The exact integration depends on how field definitions are available in the component. The engineer should trace how the review session loads field schema — it may need to be fetched from the template model associated with the document's group. If field definitions aren't currently available, add a query to fetch them.

- [ ] **Step 8: Verify HITL validation in browser**

Run: `cd apps/frontend && npm run dev`
Navigate to a HITL review session for a document that has field_format specs on its template model. Edit a correction value — verify the advisory error appears when the value doesn't match the expected pattern.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx
git commit -m "feat: wire format validation into HITL correction inputs

Advisory validation on correction fields using field_format specs.
Shows Mantine error state when canonicalized value doesn't match
pattern. Non-blocking — reviewers can still submit mismatching values."
```

---

### Task 5: Backend — Expose field_format in Template Model API responses

**Files:**
- Read: `apps/backend-services/src/template-model/dto/template-model-responses.dto.ts`
- Read: `apps/backend-services/src/template-model/template-model.service.ts`
- Modify if needed: ensure `field_format` is included in field definition API responses so the frontend can access it for HITL validation

- [ ] **Step 1: Verify field_format is already in API responses**

Read `apps/backend-services/src/template-model/dto/template-model-responses.dto.ts` — check if `field_format` is included in the FieldDefinition DTO. From earlier exploration, it already has `@ApiPropertyOptional() field_format?: string | null;` — verify this is served in API responses.

- [ ] **Step 2: Verify the frontend fetches field definitions for HITL sessions**

Trace the data flow: ReviewWorkspacePage → review session data → document → template model → field definitions. If field definitions aren't currently fetched, add a hook or extend an existing query.

- [ ] **Step 3: If changes were needed, commit**

```bash
git add <changed files>
git commit -m "feat: ensure field_format is available to HITL frontend

Verify/extend API responses and frontend queries to make field_format
accessible in the HITL review workspace for format validation."
```

---

### Task 6: Run full test suites and verify end-to-end

- [ ] **Step 1: Run backend tests**

Run: `cd apps/backend-services && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 2: Run temporal tests**

Run: `cd apps/temporal && npx jest --no-coverage`
Expected: ALL PASS

- [ ] **Step 3: Run frontend tests**

Run: `cd apps/frontend && npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: End-to-end verification**

1. Start the backend and frontend dev servers
2. Navigate to a template model, add field_format specs to some fields (e.g., SIN, phone, date)
3. Run a benchmark against a dataset using that template model — verify normalizeFields applies format specs
4. Open a HITL review session — verify validation indicators appear on correction inputs

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification"
```
