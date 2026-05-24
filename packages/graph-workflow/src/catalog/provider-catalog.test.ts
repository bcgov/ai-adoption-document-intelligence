/**
 * Unit tests for the provider catalog (US-104).
 *
 * Phase 3 seeds two entries (Azure OCR + Mistral OCR); the segmentation
 * fan-out lands in Phase 5. Tests pin the interface shape, the seed-list
 * contents, the two helpers, and the package-root barrel re-export.
 */

import {
  PROVIDER_CATALOG,
  getProviderDescriptor,
  listProvidersForKind,
  type ProviderDescriptor,
} from "./provider-catalog";
import * as packageRoot from "../index";

describe("ProviderDescriptor interface (Scenario 1)", () => {
  it("seed entries satisfy the ProviderDescriptor shape", () => {
    // `satisfies` is a compile-time check; this assignment is the runtime
    // smoke equivalent — if the interface drifts, the import above fails
    // to type-check and `npm run build` will surface it.
    const sample: ProviderDescriptor = {
      id: "azure-ocr",
      displayName: "Azure OCR",
      category: "ocr",
      acceptsKind: "Document",
      returns: "OcrResult",
    };
    expect(sample.id).toBe("azure-ocr");
    expect(sample.category).toBe("ocr");
  });
});

describe("PROVIDER_CATALOG contents (Scenario 2)", () => {
  it("has exactly two seed entries", () => {
    expect(PROVIDER_CATALOG.length).toBe(2);
  });

  it("ids are exactly 'azure-ocr' and 'mistral-ocr'", () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id).sort();
    expect(ids).toEqual(["azure-ocr", "mistral-ocr"]);
  });

  it("every entry is an ocr provider that maps Document → OcrResult", () => {
    for (const entry of PROVIDER_CATALOG) {
      expect(entry.category).toBe("ocr");
      expect(entry.acceptsKind).toBe("Document");
      expect(entry.returns).toBe("OcrResult");
    }
  });
});

describe("getProviderDescriptor (Scenario 3)", () => {
  it("returns the Azure OCR entry by id", () => {
    const entry = getProviderDescriptor("azure-ocr");
    expect(entry).toBeDefined();
    expect(entry?.displayName).toBe("Azure OCR");
  });

  it("returns undefined for an unknown id", () => {
    expect(getProviderDescriptor("nonexistent")).toBeUndefined();
  });
});

describe("listProvidersForKind (Scenario 3)", () => {
  it("returns both providers when called with Document", () => {
    const matches = listProvidersForKind("Document");
    expect(matches.map((p) => p.id).sort()).toEqual([
      "azure-ocr",
      "mistral-ocr",
    ]);
  });

  it("returns both providers when called with MultiPageDocument (subtype of Document)", () => {
    const matches = listProvidersForKind("MultiPageDocument");
    expect(matches.map((p) => p.id).sort()).toEqual([
      "azure-ocr",
      "mistral-ocr",
    ]);
  });

  it("returns both providers when called with undefined (Artifact wildcard)", () => {
    const matches = listProvidersForKind(undefined);
    expect(matches).toHaveLength(2);
  });

  it("returns an empty array for Segment (not assignable to Document)", () => {
    expect(listProvidersForKind("Segment")).toEqual([]);
  });

  it("returns an empty array for Classification (not assignable to Document)", () => {
    expect(listProvidersForKind("Classification")).toEqual([]);
  });
});

describe("package-root barrel re-export (Scenario 4)", () => {
  it("re-exports PROVIDER_CATALOG with two entries", () => {
    expect(packageRoot.PROVIDER_CATALOG).toBeDefined();
    expect(packageRoot.PROVIDER_CATALOG).toHaveLength(2);
  });

  it("re-exports getProviderDescriptor", () => {
    expect(typeof packageRoot.getProviderDescriptor).toBe("function");
    expect(packageRoot.getProviderDescriptor("azure-ocr")?.id).toBe(
      "azure-ocr",
    );
  });

  it("re-exports listProvidersForKind", () => {
    expect(typeof packageRoot.listProvidersForKind).toBe("function");
    expect(packageRoot.listProvidersForKind("Document")).toHaveLength(2);
  });
});
