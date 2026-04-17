/**
 * Unit tests for enrichment rules
 */

import type { KeyValuePair } from "../types";
import {
  applyRules,
  applyRulesToValue,
  buildFieldMap,
  type FieldDef,
  fixCharacterConfusion,
  mergeKeyValuePairs,
  normalizeDates,
  normalizeNumbers,
  trimWhitespace,
} from "./enrichment-rules";

const emptySpan = { offset: 0, length: 0 };
const emptyRegion = { pageNumber: 1, polygon: [] };

function kvp(key: string, value: string, confidence: number): KeyValuePair {
  return {
    key: { content: key, boundingRegions: [], spans: [] },
    value: {
      content: value,
      boundingRegions: [emptyRegion],
      spans: [emptySpan],
    },
    confidence,
  };
}

describe("buildFieldMap", () => {
  it("builds map from field definitions", () => {
    const defs: FieldDef[] = [
      { field_key: "Date", field_type: "date", format_spec: "YYYY-MM-DD" },
      { field_key: "Amount", field_type: "number" },
      { field_key: "Name", field_type: "string" },
    ];
    const map = buildFieldMap(defs);
    expect(map.Date).toEqual({ type: "date", format: "YYYY-MM-DD" });
    expect(map.Amount).toEqual({ type: "number", format: undefined });
    expect(map.Name).toEqual({ type: "string", format: undefined });
  });

  it("handles empty array", () => {
    expect(buildFieldMap([])).toEqual({});
  });
});

describe("trimWhitespace", () => {
  it("trims leading and trailing spaces", () => {
    const { value, change } = trimWhitespace("field", "  hello  ");
    expect(value).toBe("hello");
    expect(change).not.toBeNull();
    expect(change!.correctedValue).toBe("hello");
    expect(change!.reason).toContain("whitespace");
  });

  it("returns null change when no change", () => {
    const { value, change } = trimWhitespace("field", "hello");
    expect(value).toBe("hello");
    expect(change).toBeNull();
  });
});

describe("fixCharacterConfusion", () => {
  it("replaces O with 0 in numbers", () => {
    const { value, change } = fixCharacterConfusion("Amount", "1O0", "number");
    expect(value).toBe("100");
    expect(change).not.toBeNull();
  });

  it("replaces l with 1", () => {
    const { value } = fixCharacterConfusion("Date", "2O24-0l-15", "date");
    expect(value).toBe("2024-01-15");
  });

  it("returns null change when no replacement", () => {
    const { value, change } = fixCharacterConfusion("x", "123", "number");
    expect(value).toBe("123");
    expect(change).toBeNull();
  });

  it("does not alter month abbreviations in date fields (e.g. Sep must not become 5ep)", () => {
    const { value } = fixCharacterConfusion("date", "2006-Sep-19", "date");
    expect(value).toBe("2006-Sep-19");
  });

  it("still fixes digits in date fields while protecting month names", () => {
    const { value } = fixCharacterConfusion("date", "2O06-Sep-19", "date");
    expect(value).toBe("2006-Sep-19");
  });
});

describe("normalizeDates", () => {
  it("normalizes MM/DD/YYYY to ISO", () => {
    const { value, change } = normalizeDates("Date", "01/15/2024");
    expect(value).toBe("2024-01-15");
    expect(change).not.toBeNull();
  });

  it("normalizes DD/MM/YYYY to ISO", () => {
    const { value } = normalizeDates("Date", "15/01/2024");
    expect(value).toBe("2024-01-15");
  });

  it("leaves already ISO unchanged (no change record)", () => {
    const { value, change } = normalizeDates("Date", "2024-01-15");
    expect(value).toBe("2024-01-15");
    expect(change).toBeNull();
  });

  it("returns original when unparseable", () => {
    const { value, change } = normalizeDates("Date", "not-a-date");
    expect(value).toBe("not-a-date");
    expect(change).toBeNull();
  });
});

describe("normalizeNumbers", () => {
  it("strips currency and commas", () => {
    const { value, change } = normalizeNumbers("Amount", "$ 1,234.56");
    expect(value).toBe("1234.56");
    expect(change).not.toBeNull();
  });

  it("returns original when not a number", () => {
    const { value, change } = normalizeNumbers("x", "abc");
    expect(value).toBe("abc");
    expect(change).toBeNull();
  });
});

describe("applyRulesToValue", () => {
  it("applies trim and date normalization for date type", () => {
    const fieldMap = buildFieldMap([{ field_key: "Date", field_type: "date" }]);
    const { value, changes } = applyRulesToValue(
      "Date",
      "  01/15/2024  ",
      fieldMap,
    );
    expect(value).toBe("2024-01-15");
    expect(changes.length).toBeGreaterThanOrEqual(1);
  });

  it("applies trim and number normalization for number type", () => {
    const fieldMap = buildFieldMap([
      { field_key: "Amount", field_type: "number" },
    ]);
    const { value, changes } = applyRulesToValue(
      "Amount",
      "  $ 100  ",
      fieldMap,
    );
    expect(value).toBe("100");
    expect(changes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("applyRules", () => {
  it("applies rules to keyValuePairs and returns changes", () => {
    const fieldMap = buildFieldMap([
      { field_key: "Date", field_type: "date" },
      { field_key: "Amount", field_type: "number" },
    ]);
    const ocrResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [
        kvp("Date", "2O24-0l-15", 0.9),
        kvp("Amount", "$ 1,234.56", 0.8),
        kvp("Name", "  Jane Doe  ", 0.95),
      ],
      sections: [],
      figures: [],
      processedAt: new Date().toISOString(),
    };
    const {
      ocrResult: result,
      changes,
      rulesApplied,
    } = applyRules(ocrResult, fieldMap);
    expect(result.keyValuePairs).toHaveLength(3);
    expect(result.keyValuePairs[0].value?.content).toBe("2024-01-15");
    expect(result.keyValuePairs[1].value?.content).toBe("1234.56");
    expect(result.keyValuePairs[2].value?.content).toBe("Jane Doe");
    expect(changes.length).toBeGreaterThan(0);
    expect(rulesApplied).toContain("trimWhitespace");
  });
});

describe("mergeKeyValuePairs", () => {
  it("overlays overlay onto base by key", () => {
    const base = [kvp("a", "1", 0.8), kvp("b", "2", 0.7)];
    const overlay = [
      { key: "b", value: "2-corrected", confidence: 0.95 },
      { key: "c", value: "3-new", confidence: 0.9 },
    ];
    const merged = mergeKeyValuePairs(base, overlay);
    expect(merged).toHaveLength(3);
    const byKey = Object.fromEntries(
      merged.map((p) => [p.key.content, p.value?.content]),
    );
    expect(byKey.a).toBe("1");
    expect(byKey.b).toBe("2-corrected");
    expect(byKey.c).toBe("3-new");
  });

  it("trims key and value in overlay", () => {
    const base = [kvp("  key1  ", "  value1  ", 0.8)];
    const merged = mergeKeyValuePairs(base, []);
    expect(merged[0].key.content).toBe("key1");
    expect(merged[0].value?.content).toBe("value1");
  });
});
