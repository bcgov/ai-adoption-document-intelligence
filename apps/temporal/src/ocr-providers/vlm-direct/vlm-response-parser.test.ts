import { describe, expect, it } from "@jest/globals";
import { parseVlmStructuredJson } from "./vlm-response-parser";

const VALID = {
  fields: { name: "John Smith", amount: 12.5 },
  source_quotes: { name: "John Smith", amount: "$12.50" },
};

describe("parseVlmStructuredJson", () => {
  it("parses a clean JSON object (strict-mode happy path)", () => {
    expect(parseVlmStructuredJson(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("parses a ```json fenced block", () => {
    const content = `\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``;
    expect(parseVlmStructuredJson(content)).toEqual(VALID);
  });

  it("parses a bare ``` fenced block (no json tag)", () => {
    const content = `\`\`\`\n${JSON.stringify(VALID)}\n\`\`\``;
    expect(parseVlmStructuredJson(content)).toEqual(VALID);
  });

  it("parses a fenced block followed by trailing prose (B4 regression)", () => {
    const content = `\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\`\n\nDone — let me know if you need anything else.`;
    expect(parseVlmStructuredJson(content)).toEqual(VALID);
  });

  it("parses a fenced block preceded by prose", () => {
    const content = `Here is the extraction:\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``;
    expect(parseVlmStructuredJson(content)).toEqual(VALID);
  });

  it("throws when `fields` is missing (strict mode not active)", () => {
    expect(() =>
      parseVlmStructuredJson(JSON.stringify({ source_quotes: {} })),
    ).toThrow(/missing `fields`/);
  });

  it("throws when `source_quotes` is missing", () => {
    expect(() =>
      parseVlmStructuredJson(JSON.stringify({ fields: {} })),
    ).toThrow(/missing `source_quotes`/);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseVlmStructuredJson("{ not json")).toThrow();
  });
});
