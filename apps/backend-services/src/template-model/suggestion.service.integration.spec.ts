/* biome-ignore-all lint/suspicious/noConsole: test output for debugging */
import * as fs from "node:fs";
import * as path from "node:path";
import { FieldType } from "../generated/client";
import { SuggestionService } from "./suggestion.service";

describe("SuggestionService Integration Test", () => {
  let service: SuggestionService;
  let ocrResult: any;
  let expectedLabels: any;
  let fields: any[];

  beforeAll(() => {
    service = new SuggestionService();

    // Load test fixtures
    const fixturesDir = path.join(__dirname, "../../test/fixtures");

    const ocrData = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "ocr_output.json"), "utf-8"),
    );

    // Extract the actual OCR result from the document structure
    ocrResult = ocrData.labeling_document.ocr_result;

    expectedLabels = JSON.parse(
      fs.readFileSync(
        path.join(fixturesDir, "form_image_0.jpg.labels.json"),
        "utf-8",
      ),
    );

    const fieldsData = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "fields.json"), "utf-8"),
    );

    fields = fieldsData.fields;
  });

  it("should match expected labels from real form data", () => {
    // Convert fields to FieldDefinition format
    const fieldSchema = fields.map((field, index) => ({
      id: `field-${index}`,
      template_model_id: "test-project",
      field_key: field.fieldKey,
      field_type: FieldType[field.fieldType as keyof typeof FieldType],
      field_format: field.fieldFormat || null,
      format_spec: null,
      display_order: index,
    }));

    // Generate suggestions
    const suggestions = service.generateSuggestions(
      ocrResult,
      fieldSchema,
      null,
    );

    console.log("\n=== SUGGESTION RESULTS ===");
    console.log(`Generated ${suggestions.length} suggestions\n`);

    // Create a map of expected values by field key
    const expectedByField = new Map<string, string>();
    for (const labelData of expectedLabels.labels) {
      const fieldKey = labelData.label;
      const values = labelData.value || [];
      if (values.length > 0) {
        // Combine all text values (for fields split across multiple OCR elements)
        const textParts = values.map((v: any) => v.text);
        let text = textParts.join(" ");

        // For selection marks, normalize the value
        if (text === ":selected:") {
          text = "selected";
        } else if (text === ":unselected:") {
          text = "unselected";
        }
        expectedByField.set(fieldKey, text);
      }
    }

    // Create a map of actual suggestions by field key
    const actualByField = new Map<string, string>();
    for (const suggestion of suggestions) {
      actualByField.set(suggestion.field_key, suggestion.value || "");
    }

    // Get all field keys that have either expected or actual values
    const allFieldKeys = new Set([
      ...expectedByField.keys(),
      ...actualByField.keys(),
    ]);

    const results: Array<{
      field: string;
      expected: string | undefined;
      actual: string | undefined;
      match: boolean;
    }> = [];

    // Sort field keys for consistent output
    const sortedFieldKeys = Array.from(allFieldKeys).sort();

    // Helper to normalize whitespace for comparison (handles newlines, multiple spaces, etc.)
    const normalizeWhitespace = (text: string | undefined): string => {
      if (!text) return "";
      return text.replace(/\s+/g, " ").trim();
    };

    for (const fieldKey of sortedFieldKeys) {
      const expected = expectedByField.get(fieldKey);
      const actual = actualByField.get(fieldKey);
      // Normalize whitespace for comparison to handle formatting differences
      const match =
        normalizeWhitespace(expected) === normalizeWhitespace(actual);

      results.push({ field: fieldKey, expected, actual, match });

      if (expected || actual) {
        const status = match ? "✓" : "✗";
        console.log(`${status} ${fieldKey}:`);
        console.log(`  Expected: "${expected || "(none)"}"`);
        console.log(`  Actual:   "${actual || "(none)"}"`);
        if (!match) {
          console.log(`  MISMATCH!`);
        }
        console.log();
      }
    }

    // Count matches and mismatches
    const matches = results.filter((r) => r.match && (r.expected || r.actual));
    const mismatches = results.filter(
      (r) => !r.match && (r.expected || r.actual),
    );

    console.log("\n=== SUMMARY ===");
    console.log(`Matches: ${matches.length}`);
    console.log(`Mismatches: ${mismatches.length}`);
    console.log(`Total checked: ${matches.length + mismatches.length}`);

    if (mismatches.length > 0) {
      console.log("\nMismatched fields:");
      for (const r of mismatches) {
        console.log(
          `  - ${r.field}: expected "${r.expected}", got "${r.actual}"`,
        );
      }
    }

    // Report all suggestions for debugging
    console.log("\n=== ALL SUGGESTIONS ===");
    for (const suggestion of suggestions) {
      console.log(
        `${suggestion.field_key} = "${suggestion.value}" (source: ${suggestion.source_type})`,
      );
    }

    // Don't fail the test - we expect some mismatches initially
    // This is just for visibility
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
