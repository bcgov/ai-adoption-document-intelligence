/**
 * Tests for `formatLibraryPortSummary` (US-100 Scenario 1 + 3).
 */

import type { LibraryPortDescriptor } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { formatLibraryPortSummary } from "./format-library-port-summary";

describe("formatLibraryPortSummary — US-100 Scenario 1: kind is appended in the parenthesised segment", () => {
  it('returns "Doc (string, Document)" when both type and kind are present', () => {
    const port: LibraryPortDescriptor = {
      label: "Doc",
      path: "ctx.docUrl",
      type: "string",
      kind: "Document",
    };
    expect(formatLibraryPortSummary(port)).toBe("Doc (string, Document)");
  });

  it('returns "Classification (object, Classification)" for an object/Classification port', () => {
    const port: LibraryPortDescriptor = {
      label: "Classification",
      path: "ctx.classification",
      type: "object",
      kind: "Classification",
    };
    expect(formatLibraryPortSummary(port)).toBe(
      "Classification (object, Classification)",
    );
  });

  it('returns "Docs (array, Document[])" when the kind is an array-cardinality kind', () => {
    const port: LibraryPortDescriptor = {
      label: "Docs",
      path: "ctx.docs",
      type: "array",
      kind: "Document[]",
    };
    expect(formatLibraryPortSummary(port)).toBe("Docs (array, Document[])");
  });
});

describe("formatLibraryPortSummary — US-100 Scenario 3: undefined kind falls back to clean type-only string", () => {
  it('returns "Doc (string)" with no trailing comma when kind is undefined', () => {
    const port: LibraryPortDescriptor = {
      label: "Doc",
      path: "ctx.docUrl",
      type: "string",
    };
    expect(formatLibraryPortSummary(port)).toBe("Doc (string)");
  });

  it("does not include a parenthesised kind segment when kind is absent on an array-typed port", () => {
    const port: LibraryPortDescriptor = {
      label: "Items",
      path: "ctx.items",
      type: "array",
    };
    expect(formatLibraryPortSummary(port)).toBe("Items (array)");
  });
});
