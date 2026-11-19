/**
 * §6.4: the benchmark OCR replay injection is driven by each activity's
 * `benchmarkOcrCacheRole` catalog-entry field — NOT a hard-coded activity-type
 * list in the generic engine. These tests pin that behaviour against the real
 * Azure OCR catalog entries.
 */

import { describe, expect, it } from "@jest/globals";
import { mergeBenchmarkOcrCacheParams } from "./node-executors";

const REPLAY = { ocrResponse: { pages: [{ n: 1 }] } };

describe("mergeBenchmarkOcrCacheParams (§6.4 — catalog-driven)", () => {
  it("passes the params through unchanged when there is no replay cache in ctx", () => {
    const params = { foo: 1 };
    expect(mergeBenchmarkOcrCacheParams("azureOcr.submit", params, {})).toEqual(
      params,
    );
  });

  it("does NOT inject for an activity whose catalog entry has no role", () => {
    const params = { foo: 1 };
    const out = mergeBenchmarkOcrCacheParams("file.prepare", params, {
      __benchmarkOcrCache: REPLAY,
    });
    expect(out).toEqual(params);
    expect(out).not.toHaveProperty("__benchmarkOcrCache");
  });

  it('injects the cache object for a "passthrough" role (submit / poll), without ocrResponse', () => {
    for (const type of ["azureOcr.submit", "azureOcr.poll"]) {
      const out = mergeBenchmarkOcrCacheParams(
        type,
        { foo: 1 },
        {
          __benchmarkOcrCache: REPLAY,
        },
      );
      expect(out.__benchmarkOcrCache).toEqual(REPLAY);
      expect(out).not.toHaveProperty("ocrResponse");
      expect(out.foo).toBe(1);
    }
  });

  it('injects the cache object AND ocrResponse for the "extract" role', () => {
    const out = mergeBenchmarkOcrCacheParams(
      "azureOcr.extract",
      { foo: 1 },
      {
        __benchmarkOcrCache: REPLAY,
      },
    );
    expect(out.__benchmarkOcrCache).toEqual(REPLAY);
    expect(out.ocrResponse).toEqual(REPLAY.ocrResponse);
  });

  it("ignores a malformed replay payload (no ocrResponse key)", () => {
    const params = { foo: 1 };
    const out = mergeBenchmarkOcrCacheParams("azureOcr.extract", params, {
      __benchmarkOcrCache: { notOcr: true },
    });
    expect(out).toEqual(params);
  });
});
