/**
 * Tests for `computeInputHash` (US-129).
 *
 * Coverage maps to the six acceptance scenarios in
 * `US-129-compute-input-hash-helper.md`:
 *
 *   1. Collect ctx values for each port binding; unrelated ctx keys ignored.
 *   2. Empty / absent `node.inputs` returns sha256("{}").
 *   3. Document / Segment ctx values normalised via `hashArtifact` first.
 *   4. Primitives flow through `stableJson` directly.
 *   5. Missing ctxKey recorded as `null` (stable sentinel).
 *   6. ≥7 cases covering: empty inputs, single primitive, multiple
 *      bindings, Document-content normalisation, missing ctxKey, port
 *      order independence, unrelated-ctx-keys-don't-leak.
 */

import { createHash } from "crypto";

import type { ActivityNode } from "../types";
import { computeInputHash } from "./compute-input-hash";
import { hashArtifact } from "./hash-artifact";
import { stableJson } from "./stable-json";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function makeActivity(
  id: string,
  inputs: ActivityNode["inputs"],
  activityType = "noop",
): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType,
    inputs,
  };
}

describe("computeInputHash — Scenario 1: collect ctx values per port binding", () => {
  it("builds a consumed map keyed by port name and ignores unrelated ctx keys", () => {
    const node = makeActivity("n1", [
      { port: "doc", ctxKey: "documentUrl" },
      { port: "rules", ctxKey: "validationRules" },
    ]);
    const ctx = {
      documentUrl: "https://example.com/x",
      validationRules: [{ field: "amount", op: "gt", value: 0 }],
      unrelated: 1,
      anotherUnrelated: { foo: "bar" },
    };

    const expected = sha256Hex(
      stableJson({
        doc: "https://example.com/x",
        rules: [{ field: "amount", op: "gt", value: 0 }],
      }),
    );
    expect(computeInputHash(node, ctx)).toBe(expected);
  });

  it("produces the same hash when unrelated ctx keys are added or removed", () => {
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "documentUrl" }]);
    const ctxA = { documentUrl: "u", noise: 1 };
    const ctxB = { documentUrl: "u", noise: 2, extra: "x" };
    expect(computeInputHash(node, ctxA)).toBe(computeInputHash(node, ctxB));
  });
});

describe("computeInputHash — Scenario 2: empty / absent inputs", () => {
  it("returns sha256('{}') when node.inputs is an empty array", () => {
    const node = makeActivity("n1", []);
    expect(computeInputHash(node, { anything: 1 })).toBe(sha256Hex("{}"));
  });

  it("returns sha256('{}') when node.inputs is undefined", () => {
    const node = makeActivity("n1", undefined);
    expect(computeInputHash(node, {})).toBe(sha256Hex("{}"));
  });

  it("two different nodes with no inputs share the same inputHash", () => {
    const a = makeActivity("a", []);
    const b = makeActivity("b", undefined);
    expect(computeInputHash(a, { x: 1 })).toBe(computeInputHash(b, { y: 2 }));
  });
});

describe("computeInputHash — Scenario 3: Document/Segment normalisation via hashArtifact", () => {
  it("hashes a Document ctx value via hashArtifact, not raw stableJson", () => {
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "document" }]);
    const document = {
      url: "https://example.com/blob?token=A",
      blobKey: "tenant/file.pdf",
      mimeType: "application/pdf",
    };

    const expected = sha256Hex(
      stableJson({ doc: hashArtifact(document) }),
    );
    expect(computeInputHash(node, { document })).toBe(expected);
  });

  it("produces the same inputHash for two Documents with same blobKey but different URLs", () => {
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "document" }]);
    const docA = {
      url: "https://example.com/?token=A&expires=1",
      blobKey: "tenant/file.pdf",
      mimeType: "application/pdf",
    };
    const docB = {
      url: "https://example.com/?token=B&expires=999",
      blobKey: "tenant/file.pdf",
      mimeType: "application/pdf",
    };
    expect(computeInputHash(node, { document: docA })).toBe(
      computeInputHash(node, { document: docB }),
    );
  });

  it("hashes a Segment ctx value via hashArtifact (excluding kind/confidence)", () => {
    const node = makeActivity("n1", [{ port: "seg", ctxKey: "segment" }]);
    const segA = {
      parentDocId: "doc-1",
      pageRange: { start: 1, end: 1 },
      polygon: [{ x: 0, y: 0 }],
      kind: "Text",
      confidence: 0.5,
    };
    const segB = {
      parentDocId: "doc-1",
      pageRange: { start: 1, end: 1 },
      polygon: [{ x: 0, y: 0 }],
      kind: "Table",
      confidence: 0.99,
    };
    expect(computeInputHash(node, { segment: segA })).toBe(
      computeInputHash(node, { segment: segB }),
    );
  });

  it("hashes an array of Documents via hashArtifact", () => {
    const node = makeActivity("n1", [{ port: "docs", ctxKey: "documents" }]);
    const documents = [
      { url: "u1", blobKey: "k1", mimeType: "application/pdf" },
      { url: "u2", blobKey: "k2", mimeType: "application/pdf" },
    ];
    const expected = sha256Hex(
      stableJson({ docs: hashArtifact(documents) }),
    );
    expect(computeInputHash(node, { documents })).toBe(expected);
  });
});

describe("computeInputHash — Scenario 4: primitives flow through stableJson", () => {
  it("passes a string ctx value through verbatim", () => {
    const node = makeActivity("n1", [{ port: "name", ctxKey: "userName" }]);
    const expected = sha256Hex(stableJson({ name: "alex" }));
    expect(computeInputHash(node, { userName: "alex" })).toBe(expected);
  });

  it("passes a number ctx value through verbatim", () => {
    const node = makeActivity("n1", [{ port: "count", ctxKey: "n" }]);
    const expected = sha256Hex(stableJson({ count: 42 }));
    expect(computeInputHash(node, { n: 42 })).toBe(expected);
  });

  it("passes a boolean ctx value through verbatim", () => {
    const node = makeActivity("n1", [{ port: "flag", ctxKey: "enabled" }]);
    const expected = sha256Hex(stableJson({ flag: true }));
    expect(computeInputHash(node, { enabled: true })).toBe(expected);
  });

  it("passes a plain object ctx value (no artifact markers) through stableJson", () => {
    const node = makeActivity("n1", [{ port: "cfg", ctxKey: "config" }]);
    const config = { tolerance: 0.05, strict: true };
    const expected = sha256Hex(stableJson({ cfg: config }));
    expect(computeInputHash(node, { config })).toBe(expected);
  });
});

describe("computeInputHash — Scenario 5: missing ctx key recorded as null sentinel", () => {
  it("records `null` for a binding whose ctxKey is absent from ctx", () => {
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "missing" }]);
    const expected = sha256Hex(stableJson({ doc: null }));
    expect(computeInputHash(node, {})).toBe(expected);
  });

  it("records `null` for a binding whose ctxKey is explicitly undefined", () => {
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "documentUrl" }]);
    const expected = sha256Hex(stableJson({ doc: null }));
    expect(computeInputHash(node, { documentUrl: undefined })).toBe(expected);
  });

  it("two nodes both missing the same ctxKey share the same inputHash", () => {
    const a = makeActivity("a", [{ port: "doc", ctxKey: "missing" }]);
    const b = makeActivity("b", [{ port: "doc", ctxKey: "missing" }]);
    expect(computeInputHash(a, {})).toBe(computeInputHash(b, {}));
  });

  it("distinguishes a missing ctxKey from a present-but-null ctxKey only via stableJson's encoding (both encode to null)", () => {
    // Both encode to the same hash because null is the stable sentinel
    // for absent values AND `null` itself stableJson-serialises to "null".
    // Documenting the intentional collision.
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "documentUrl" }]);
    expect(computeInputHash(node, {})).toBe(
      computeInputHash(node, { documentUrl: null }),
    );
  });
});

describe("computeInputHash — Scenario 6: ≥7 cases covering the contract", () => {
  // Case 1: empty inputs returns sha256("{}")
  it("[case 1] empty inputs returns sha256('{}')", () => {
    const node = makeActivity("n1", []);
    expect(computeInputHash(node, {})).toBe(sha256Hex("{}"));
  });

  // Case 2: single primitive input
  it("[case 2] single primitive input flows through stableJson", () => {
    const node = makeActivity("n1", [{ port: "name", ctxKey: "userName" }]);
    expect(computeInputHash(node, { userName: "alex" })).toBe(
      sha256Hex(stableJson({ name: "alex" })),
    );
  });

  // Case 3: multiple bindings — all included
  it("[case 3] multiple bindings — every port is included in the hashed map", () => {
    const node = makeActivity("n1", [
      { port: "a", ctxKey: "ka" },
      { port: "b", ctxKey: "kb" },
      { port: "c", ctxKey: "kc" },
    ]);
    const ctx = { ka: 1, kb: 2, kc: 3 };
    expect(computeInputHash(node, ctx)).toBe(
      sha256Hex(stableJson({ a: 1, b: 2, c: 3 })),
    );
  });

  // Case 4: Document content normalisation — same blobKey, different URL → same hash
  it("[case 4] Document-content normalisation — same blobKey, different URL produces same inputHash", () => {
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "document" }]);
    const docA = {
      url: "https://x.com/?token=A",
      blobKey: "shared-key",
      mimeType: "application/pdf",
    };
    const docB = {
      url: "https://x.com/?token=B&signature=z",
      blobKey: "shared-key",
      mimeType: "application/pdf",
    };
    expect(computeInputHash(node, { document: docA })).toBe(
      computeInputHash(node, { document: docB }),
    );
  });

  // Case 5: missing ctxKey recorded as null
  it("[case 5] missing ctxKey recorded as null sentinel", () => {
    const node = makeActivity("n1", [
      { port: "doc", ctxKey: "documentUrl" },
      { port: "rules", ctxKey: "validationRules" },
    ]);
    const expected = sha256Hex(stableJson({ doc: "u", rules: null }));
    expect(computeInputHash(node, { documentUrl: "u" })).toBe(expected);
  });

  // Case 6: port-order independence
  it("[case 6] port-order independence — same bindings declared in different order produce same hash", () => {
    const nodeAB = makeActivity("ab", [
      { port: "a", ctxKey: "ka" },
      { port: "b", ctxKey: "kb" },
    ]);
    const nodeBA = makeActivity("ba", [
      { port: "b", ctxKey: "kb" },
      { port: "a", ctxKey: "ka" },
    ]);
    const ctx = { ka: "x", kb: "y" };
    expect(computeInputHash(nodeAB, ctx)).toBe(computeInputHash(nodeBA, ctx));
  });

  // Case 7: unrelated ctx keys don't leak into the hash
  it("[case 7] unrelated ctx keys do not affect the inputHash", () => {
    const node = makeActivity("n1", [{ port: "doc", ctxKey: "documentUrl" }]);
    const ctxA = { documentUrl: "u" };
    const ctxB = { documentUrl: "u", extra: "leaked", more: { nested: true } };
    expect(computeInputHash(node, ctxA)).toBe(computeInputHash(node, ctxB));
  });

  // Bonus: mixed primitive + Document
  it("[case 8] mixed primitive + Document bindings hash correctly", () => {
    const node = makeActivity("n1", [
      { port: "doc", ctxKey: "document" },
      { port: "tol", ctxKey: "tolerance" },
    ]);
    const document = {
      url: "https://example.com/x",
      blobKey: "alpha/file.pdf",
      mimeType: "application/pdf",
    };
    const expected = sha256Hex(
      stableJson({ doc: hashArtifact(document), tol: 0.05 }),
    );
    expect(computeInputHash(node, { document, tolerance: 0.05 })).toBe(expected);
  });
});

describe("computeInputHash — barrel re-export sanity", () => {
  it("is a function accepting two arguments", () => {
    expect(typeof computeInputHash).toBe("function");
    expect(computeInputHash.length).toBe(2);
  });

  it("returns a 64-char hex string for every supported input shape", () => {
    const hexPattern = /^[0-9a-f]{64}$/;
    const empty = makeActivity("a", []);
    const one = makeActivity("b", [{ port: "x", ctxKey: "x" }]);
    expect(computeInputHash(empty, {})).toMatch(hexPattern);
    expect(computeInputHash(one, { x: 1 })).toMatch(hexPattern);
    expect(computeInputHash(one, {})).toMatch(hexPattern);
    expect(
      computeInputHash(one, {
        x: { url: "u", blobKey: "k", mimeType: "m" },
      }),
    ).toMatch(hexPattern);
  });
});
