import { resolveDocumentIntelligenceMode } from "./document-intelligence-mode";

describe("resolveDocumentIntelligenceMode", () => {
  it('returns "mock" only for explicit mock', () => {
    expect(resolveDocumentIntelligenceMode("mock")).toBe("mock");
  });

  it('returns "live" for undefined, empty, or other values', () => {
    expect(resolveDocumentIntelligenceMode(undefined)).toBe("live");
    expect(resolveDocumentIntelligenceMode("")).toBe("live");
    expect(resolveDocumentIntelligenceMode("live")).toBe("live");
    expect(resolveDocumentIntelligenceMode("MOCK")).toBe("live");
  });
});
