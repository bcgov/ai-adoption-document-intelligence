/**
 * Tests for `hashArtifact` (US-128).
 *
 * Coverage maps to the six acceptance scenarios in
 * `US-128-hash-artifact-helper.md`:
 *
 *   1. Document path — `blobKey` normalisation, URL ignored.
 *   2. Segment path — `parentDocId + pageRange + polygon` normalisation,
 *      `kind` and `confidence` excluded.
 *   3. Arrays of artifacts hashed element-wise, order preserved.
 *   4. Primitives + plain objects without artifact markers fall through
 *      to `stableJson` + sha256.
 *   5. Partial-shape rejection — ambiguous shapes are NOT silently
 *      re-coerced to a Document/Segment hash.
 *   6. ≥10 cases covering Document, Segment, arrays, primitives,
 *      partial-shape rejection, empty array, nested mixed array.
 */

import { createHash } from "crypto";

import { hashArtifact } from "./hash-artifact";
import { stableJson } from "./stable-json";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("hashArtifact — Scenario 1: Document → blobKey normalisation", () => {
  it("hashes a Document-shaped object using only its blobKey", () => {
    const doc = {
      url: "https://example.com/blob?token=A&expires=12345",
      blobKey: "abc/def.pdf",
      mimeType: "application/pdf",
    };
    expect(hashArtifact(doc)).toBe(sha256Hex("Document:abc/def.pdf"));
  });

  it("produces the same hash for two Documents with different presigned URLs but the same blobKey", () => {
    const docA = {
      url: "https://example.com/blob?token=A",
      blobKey: "tenant-1/file.pdf",
      mimeType: "application/pdf",
    };
    const docB = {
      url: "https://example.com/blob?token=B&signature=xyz",
      blobKey: "tenant-1/file.pdf",
      mimeType: "application/pdf",
    };
    expect(hashArtifact(docA)).toBe(hashArtifact(docB));
  });

  it("treats blobKey + url alone (no mimeType) as a Document", () => {
    const doc = {
      url: "https://example.com/x",
      blobKey: "k1",
    };
    expect(hashArtifact(doc)).toBe(sha256Hex("Document:k1"));
  });

  it("treats blobKey + mimeType alone (no url) as a Document", () => {
    const doc = {
      blobKey: "k2",
      mimeType: "image/png",
    };
    expect(hashArtifact(doc)).toBe(sha256Hex("Document:k2"));
  });
});

describe("hashArtifact — Scenario 2: Segment normalisation", () => {
  it("hashes a Segment using parentDocId + pageRange + polygon, excluding kind/confidence", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ];
    const segment = {
      parentDocId: "doc-7",
      pageRange: { start: 2, end: 5 },
      polygon,
      kind: "Text",
      confidence: 0.92,
    };
    const expected = sha256Hex(
      `Segment:doc-7:2-5:${stableJson(polygon)}`,
    );
    expect(hashArtifact(segment)).toBe(expected);
  });

  it("produces the same hash when kind or confidence differ but identity fields match", () => {
    const polygon = [{ x: 1, y: 2 }];
    const a = {
      parentDocId: "doc-7",
      pageRange: { start: 1, end: 1 },
      polygon,
      kind: "Text",
      confidence: 0.5,
    };
    const b = {
      parentDocId: "doc-7",
      pageRange: { start: 1, end: 1 },
      polygon,
      kind: "Table",
      confidence: 0.99,
    };
    expect(hashArtifact(a)).toBe(hashArtifact(b));
  });

  it("uses an empty pageRange segment when pageRange is absent", () => {
    const polygon = [{ x: 0, y: 0 }];
    const segment = {
      parentDocId: "doc-9",
      polygon,
    };
    const expected = sha256Hex(`Segment:doc-9::${stableJson(polygon)}`);
    expect(hashArtifact(segment)).toBe(expected);
  });

  it("produces different hashes when polygon coordinates differ", () => {
    const a = {
      parentDocId: "doc-1",
      pageRange: { start: 1, end: 1 },
      polygon: [{ x: 0, y: 0 }],
    };
    const b = {
      parentDocId: "doc-1",
      pageRange: { start: 1, end: 1 },
      polygon: [{ x: 1, y: 1 }],
    };
    expect(hashArtifact(a)).not.toBe(hashArtifact(b));
  });
});

describe("hashArtifact — Scenario 3: arrays hash element-wise with order preserved", () => {
  it("hashes an array of Segments as sha256('[' + h1 + ',' + h2 + ']')", () => {
    const seg1 = {
      parentDocId: "doc-1",
      pageRange: { start: 1, end: 1 },
      polygon: [{ x: 0, y: 0 }],
    };
    const seg2 = {
      parentDocId: "doc-2",
      pageRange: { start: 3, end: 4 },
      polygon: [{ x: 5, y: 5 }],
    };
    const expected = sha256Hex(
      `[${hashArtifact(seg1)},${hashArtifact(seg2)}]`,
    );
    expect(hashArtifact([seg1, seg2])).toBe(expected);
  });

  it("changes hash if array order changes (order is preserved, not sorted)", () => {
    const seg1 = {
      parentDocId: "doc-1",
      pageRange: { start: 1, end: 1 },
      polygon: [{ x: 0, y: 0 }],
    };
    const seg2 = {
      parentDocId: "doc-2",
      pageRange: { start: 3, end: 4 },
      polygon: [{ x: 5, y: 5 }],
    };
    expect(hashArtifact([seg1, seg2])).not.toBe(hashArtifact([seg2, seg1]));
  });
});

describe("hashArtifact — Scenario 4: non-artifact values fall through to stableJson + sha256", () => {
  it("hashes a string via stableJson + sha256", () => {
    expect(hashArtifact("hello")).toBe(sha256Hex(stableJson("hello")));
  });

  it("hashes a number via stableJson + sha256", () => {
    expect(hashArtifact(42)).toBe(sha256Hex(stableJson(42)));
  });

  it("hashes a boolean via stableJson + sha256", () => {
    expect(hashArtifact(true)).toBe(sha256Hex(stableJson(true)));
  });

  it("hashes a plain object without artifact markers via stableJson", () => {
    const value = { foo: "bar", count: 3 };
    expect(hashArtifact(value)).toBe(sha256Hex(stableJson(value)));
  });

  it("hashes null and undefined via stableJson", () => {
    expect(hashArtifact(null)).toBe(sha256Hex(stableJson(null)));
    expect(hashArtifact(undefined)).toBe(sha256Hex(stableJson(undefined)));
  });
});

describe("hashArtifact — Scenario 5: partial shapes do not coerce to artifact hash", () => {
  it("falls through to stableJson when only `blobKey` is present (no url/mimeType)", () => {
    const partial = { blobKey: "x" };
    expect(hashArtifact(partial)).toBe(sha256Hex(stableJson(partial)));
    expect(hashArtifact(partial)).not.toBe(sha256Hex("Document:x"));
  });

  it("falls through to stableJson when blobKey is not a string", () => {
    const partial = { blobKey: 42, url: "https://example.com" };
    expect(hashArtifact(partial)).toBe(sha256Hex(stableJson(partial)));
  });

  it("falls through when only `parentDocId` is present (no polygon)", () => {
    const partial = { parentDocId: "x" };
    expect(hashArtifact(partial)).toBe(sha256Hex(stableJson(partial)));
  });

  it("falls through when only `polygon` is present (no parentDocId)", () => {
    const partial = { polygon: [{ x: 0, y: 0 }] };
    expect(hashArtifact(partial)).toBe(sha256Hex(stableJson(partial)));
  });

  it("falls through when polygon is not an array", () => {
    const partial = { parentDocId: "doc-1", polygon: "not-an-array" };
    expect(hashArtifact(partial)).toBe(sha256Hex(stableJson(partial)));
  });
});

describe("hashArtifact — Scenario 6: ≥10 cases covering the contract", () => {
  // Case 1: Document path
  it("[case 1] Document path uses sha256('Document:' + blobKey)", () => {
    const doc = {
      url: "https://example.com/?t=1",
      blobKey: "alpha/file.pdf",
      mimeType: "application/pdf",
    };
    expect(hashArtifact(doc)).toBe(sha256Hex("Document:alpha/file.pdf"));
  });

  // Case 2: Segment path
  it("[case 2] Segment path includes parentDocId, pageRange, polygon — excludes kind/confidence", () => {
    const polygon = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    const segment = {
      parentDocId: "doc-42",
      pageRange: { start: 1, end: 2 },
      polygon,
      kind: "Text",
      confidence: 0.8,
    };
    expect(hashArtifact(segment)).toBe(
      sha256Hex(`Segment:doc-42:1-2:${stableJson(polygon)}`),
    );
  });

  // Case 3: Array of Documents
  it("[case 3] array of Documents hashes element-wise", () => {
    const a = { url: "u1", blobKey: "k1", mimeType: "m" };
    const b = { url: "u2", blobKey: "k2", mimeType: "m" };
    expect(hashArtifact([a, b])).toBe(
      sha256Hex(`[${hashArtifact(a)},${hashArtifact(b)}]`),
    );
  });

  // Case 4: Array of Segments
  it("[case 4] array of Segments hashes element-wise", () => {
    const s1 = {
      parentDocId: "d1",
      pageRange: { start: 1, end: 1 },
      polygon: [{ x: 0, y: 0 }],
    };
    const s2 = {
      parentDocId: "d2",
      pageRange: { start: 2, end: 3 },
      polygon: [{ x: 1, y: 1 }],
    };
    expect(hashArtifact([s1, s2])).toBe(
      sha256Hex(`[${hashArtifact(s1)},${hashArtifact(s2)}]`),
    );
  });

  // Case 5: Primitive — string
  it("[case 5] primitive string falls through to stableJson + sha256", () => {
    expect(hashArtifact("abc")).toBe(sha256Hex('"abc"'));
  });

  // Case 6: Primitive — number
  it("[case 6] primitive number falls through to stableJson + sha256", () => {
    expect(hashArtifact(123)).toBe(sha256Hex("123"));
  });

  // Case 7: Partial Document rejection
  it("[case 7] partial Document shape ({ blobKey: 'x' }) is not coerced", () => {
    const value = { blobKey: "x" };
    expect(hashArtifact(value)).toBe(sha256Hex(stableJson(value)));
    expect(hashArtifact(value)).not.toBe(sha256Hex("Document:x"));
  });

  // Case 8: Partial Segment rejection
  it("[case 8] partial Segment shape ({ parentDocId: 'x' }) is not coerced", () => {
    const value = { parentDocId: "x" };
    expect(hashArtifact(value)).toBe(sha256Hex(stableJson(value)));
  });

  // Case 9: Empty array
  it("[case 9] empty array hashes to sha256('[]')", () => {
    expect(hashArtifact([])).toBe(sha256Hex("[]"));
  });

  // Case 10: Nested array of mixed primitives + artifacts
  it("[case 10] nested array of mixed primitives + artifacts hashes element-wise", () => {
    const doc = {
      url: "https://example.com/x",
      blobKey: "mixed/doc.pdf",
      mimeType: "application/pdf",
    };
    const segment = {
      parentDocId: "p-1",
      pageRange: { start: 5, end: 6 },
      polygon: [{ x: 9, y: 9 }],
    };
    const mixed: unknown[] = [doc, "label", 42, segment];
    const expected = sha256Hex(
      `[${hashArtifact(doc)},${hashArtifact("label")},${hashArtifact(42)},${hashArtifact(segment)}]`,
    );
    expect(hashArtifact(mixed)).toBe(expected);
  });
});

describe("hashArtifact — barrel re-export sanity", () => {
  it("is a function accepting a single unknown argument", () => {
    expect(typeof hashArtifact).toBe("function");
    expect(hashArtifact.length).toBe(1);
  });

  it("returns a 64-char hex string (sha256) for every supported input shape", () => {
    const hexPattern = /^[0-9a-f]{64}$/;
    expect(hashArtifact({})).toMatch(hexPattern);
    expect(hashArtifact([])).toMatch(hexPattern);
    expect(hashArtifact("x")).toMatch(hexPattern);
    expect(hashArtifact(1)).toMatch(hexPattern);
    expect(hashArtifact(true)).toMatch(hexPattern);
    expect(hashArtifact(null)).toMatch(hexPattern);
    expect(hashArtifact(undefined)).toMatch(hexPattern);
    expect(
      hashArtifact({ url: "u", blobKey: "k", mimeType: "m" }),
    ).toMatch(hexPattern);
    expect(
      hashArtifact({
        parentDocId: "p",
        polygon: [{ x: 0, y: 0 }],
      }),
    ).toMatch(hexPattern);
  });
});
