/**
 * Tests for `isLibraryCompatibleWithUpstream` (US-100 Scenario 4).
 */

import type { LibraryPortDescriptor } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { isLibraryCompatibleWithUpstream } from "./library-compat";

function port(
  label: string,
  type: LibraryPortDescriptor["type"],
  kind?: LibraryPortDescriptor["kind"],
): LibraryPortDescriptor {
  return { label, path: `ctx.${label.toLowerCase()}`, type, kind };
}

describe("isLibraryCompatibleWithUpstream", () => {
  it("returns true when the library has no inputs (nothing to gate on)", () => {
    expect(isLibraryCompatibleWithUpstream([], "Document")).toBe(true);
  });

  it("returns true when the expectation is undefined (no filter — Scenario 3 fall-through)", () => {
    const inputs = [port("Doc", "string", "Segment")];
    expect(isLibraryCompatibleWithUpstream(inputs, undefined)).toBe(true);
  });

  it("returns true when the first input's kind matches the expectation exactly", () => {
    const inputs = [port("Doc", "string", "Document")];
    expect(isLibraryCompatibleWithUpstream(inputs, "Document")).toBe(true);
  });

  it("returns true when the expectation is a subtype of the first input's kind (Document is assignable to Artifact)", () => {
    const inputs = [port("Any", "string", "Artifact")];
    expect(isLibraryCompatibleWithUpstream(inputs, "Document")).toBe(true);
  });

  it("returns false when the first input's kind is incompatible with the expectation", () => {
    const inputs = [port("Seg", "string", "Segment")];
    expect(isLibraryCompatibleWithUpstream(inputs, "Document")).toBe(false);
  });

  it("returns true when the first input has no declared kind (wildcard Artifact)", () => {
    const inputs = [port("Anything", "string")];
    expect(isLibraryCompatibleWithUpstream(inputs, "Document")).toBe(true);
  });
});
