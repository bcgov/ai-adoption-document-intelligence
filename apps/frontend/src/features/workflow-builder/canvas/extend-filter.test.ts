/**
 * Unit tests for `extend-filter` (PORT_WIRING_DESIGN.md §9 — kind-aware
 * extend popover). Real catalog activity types throughout so the kind
 * lookups exercise the actual registry:
 *
 *   - azureOcr.submit         input fileData: PreparedFile (typed, auto-wireable)
 *   - azureOcr.extract        inputs all base-Artifact     (wildcard-only)
 *   - document.classify       input ocrResult: OcrResult   (first typed input)
 *   - document.split          input blobKey: MultiPageDocument (exact for MPD)
 *   - document.normalizeOrientation input blobKey: Document (assignable for MPD)
 */

import { describe, expect, it } from "vitest";
import {
  entryAcceptsKind,
  entryProducesKind,
  firstMatchingInputPort,
  firstMatchingOutputPort,
  rankActivityTypesForKind,
  rankActivityTypesProducingKind,
} from "./extend-filter";

describe("entryAcceptsKind", () => {
  it("true when the activity has an auto-wireable input assignable from K", () => {
    // azureOcr.submit.fileData is typed `PreparedFile`; a `PreparedFile`
    // producer is assignable to it.
    expect(entryAcceptsKind("azureOcr.submit", "PreparedFile")).toBe(true);
  });

  it("false when the activity's only assignable inputs are base-Artifact wildcards", () => {
    // azureOcr.extract's inputs are all base-`Artifact` wildcards — they
    // accept everything, so filtering on them is noise and must NOT count
    // as a match (mirrors shouldAutoWirePort).
    expect(entryAcceptsKind("azureOcr.extract", "Document")).toBe(false);
  });

  it("false for a catalog-less / unknown activityType", () => {
    expect(entryAcceptsKind("not.a.real.activity", "Document")).toBe(false);
  });
});

describe("firstMatchingInputPort", () => {
  it("returns the first auto-wireable input port (declaration order) assignable from K", () => {
    // document.classify declares `ocrResult: OcrResult` before `segment`.
    expect(firstMatchingInputPort("document.classify", "OcrResult")).toBe(
      "ocrResult",
    );
  });

  it("returns null when none match", () => {
    // azureOcr.submit's only typed input is `Document`; an `OcrResult`
    // producer is not assignable to it, and the rest are wildcards.
    expect(firstMatchingInputPort("azureOcr.submit", "OcrResult")).toBeNull();
  });
});

describe("rankActivityTypesForKind", () => {
  it("exact-kind matches rank before merely-assignable ones; order otherwise stable", () => {
    // For MultiPageDocument: document.split has an EXACT `MultiPageDocument`
    // input; azureOcr.submit has a `Document` input (assignable, not exact).
    expect(
      rankActivityTypesForKind(
        ["azureOcr.submit", "document.split"],
        "MultiPageDocument",
      ),
    ).toEqual(["document.split", "azureOcr.submit"]);

    // Stability: when the exact match already leads, order is preserved.
    expect(
      rankActivityTypesForKind(
        ["document.split", "azureOcr.submit"],
        "MultiPageDocument",
      ),
    ).toEqual(["document.split", "azureOcr.submit"]);
  });
});

// ---------------------------------------------------------------------------
// Producer-side mirror (UX walkthrough 2026-07-29) — upstream extend.
//   - file.prepare        output preparedData: PreparedFile (baseKind Document)
//   - mistralOcr.process  output ocrResult: OcrResult (exact)
// ---------------------------------------------------------------------------

describe("entryProducesKind", () => {
  it("true when the activity has a typed output assignable to K (exact)", () => {
    expect(entryProducesKind("file.prepare", "PreparedFile")).toBe(true);
  });

  it("true via the subtype walk (PreparedFile is assignable to Document)", () => {
    expect(entryProducesKind("file.prepare", "Document")).toBe(true);
  });

  it("false when no output can satisfy K", () => {
    expect(entryProducesKind("file.prepare", "OcrResult")).toBe(false);
  });

  it("false for a catalog-less / unknown activityType", () => {
    expect(entryProducesKind("not.a.real.activity", "Document")).toBe(false);
  });
});

describe("firstMatchingOutputPort", () => {
  it("returns the first typed output port assignable to K", () => {
    expect(firstMatchingOutputPort("mistralOcr.process", "OcrResult")).toBe(
      "ocrResult",
    );
    expect(firstMatchingOutputPort("file.prepare", "Document")).toBe(
      "preparedData",
    );
  });

  it("returns null when none match", () => {
    expect(firstMatchingOutputPort("file.prepare", "OcrResult")).toBeNull();
  });
});

describe("rankActivityTypesProducingKind", () => {
  it("exact-output matches rank before the rest; order otherwise stable", () => {
    expect(
      rankActivityTypesProducingKind(
        ["file.prepare", "mistralOcr.process"],
        "OcrResult",
      ),
    ).toEqual(["mistralOcr.process", "file.prepare"]);
    expect(
      rankActivityTypesProducingKind(
        ["mistralOcr.process", "file.prepare"],
        "OcrResult",
      ),
    ).toEqual(["mistralOcr.process", "file.prepare"]);
  });
});
