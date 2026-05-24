/**
 * Tests for `computeHandleStyle` — the pure helper that translates a
 * node side's declared `KindRef` list into the canvas handle's colour
 * + cardinality outline + hover tooltip text (US-095).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/user_stories/US-095-handle-colour-and-tooltip.md.
 */

import { describe, expect, it } from "vitest";

import { computeHandleStyle } from "./handle-style";

describe("computeHandleStyle — Scenario 1: single typed port is coloured by kind", () => {
  it("colours a single `Segment[]` output handle green with doubled outline + verbatim tooltip", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment[]"],
      direction: "output",
    });
    expect(style.color).toBe("green");
    expect(style.isArray).toBe(true);
    expect(style.isMultiPort).toBe(false);
    expect(style.tooltipText).toBe("Segment[]");
  });

  it("colours a single `Document` input handle blue with no doubled outline", () => {
    const style = computeHandleStyle({
      portKinds: ["Document"],
      direction: "input",
    });
    expect(style.color).toBe("blue");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(false);
    expect(style.tooltipText).toBe("Document");
  });

  it("colours a single `OcrResult` output handle violet", () => {
    const style = computeHandleStyle({
      portKinds: ["OcrResult"],
      direction: "output",
    });
    expect(style.color).toBe("violet");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(false);
    expect(style.tooltipText).toBe("OcrResult");
  });

  it("colours a single `Classification` output handle yellow (Mantine's amber)", () => {
    const style = computeHandleStyle({
      portKinds: ["Classification"],
      direction: "output",
    });
    expect(style.color).toBe("yellow");
    expect(style.tooltipText).toBe("Classification");
  });

  it("colours a single `Reference` input handle teal", () => {
    const style = computeHandleStyle({
      portKinds: ["Reference"],
      direction: "input",
    });
    expect(style.color).toBe("teal");
    expect(style.tooltipText).toBe("Reference");
  });

  it("ignores `undefined` entries when counting typed ports — a single typed + N untyped still colours by the lone typed port", () => {
    const style = computeHandleStyle({
      portKinds: [undefined, "Segment", undefined],
      direction: "input",
    });
    expect(style.color).toBe("green");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(false);
    expect(style.tooltipText).toBe("Segment");
  });
});

describe("computeHandleStyle — Scenario 2: zero or multi typed ports stay gray", () => {
  it("zero declared kinds → gray + isMultiPort: true (legacy untyped node)", () => {
    const style = computeHandleStyle({
      portKinds: [],
      direction: "output",
    });
    expect(style.color).toBe("gray");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(true);
  });

  it("only undefined entries → gray + isMultiPort: true (every port lacks `kind`)", () => {
    const style = computeHandleStyle({
      portKinds: [undefined, undefined, undefined],
      direction: "input",
    });
    expect(style.color).toBe("gray");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(true);
  });

  it("two typed kinds → gray (no 'primary port' selection)", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment", "OcrResult"],
      direction: "input",
    });
    expect(style.color).toBe("gray");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(true);
  });

  it("three typed kinds → gray", () => {
    const style = computeHandleStyle({
      portKinds: ["Document", "Segment", "OcrResult"],
      direction: "output",
    });
    expect(style.color).toBe("gray");
    expect(style.isMultiPort).toBe(true);
  });

  it("mix of typed + untyped where 2+ are typed → gray (untyped don't promote the typed minority)", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment", undefined, "Classification"],
      direction: "output",
    });
    expect(style.color).toBe("gray");
    expect(style.isMultiPort).toBe(true);
  });
});

describe("computeHandleStyle — Scenario 3: single-port tooltip is the kind literal verbatim", () => {
  it("renders `Segment[]` verbatim — `[]` suffix is preserved", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment[]"],
      direction: "output",
    });
    expect(style.tooltipText).toBe("Segment[]");
  });

  it("renders a parameterised kind verbatim — `Segment<Table>`", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment<Table>"],
      direction: "input",
    });
    expect(style.tooltipText).toBe("Segment<Table>");
    expect(style.color).toBe("green");
    expect(style.isArray).toBe(false);
  });

  it("renders a parameterised array kind verbatim — `Segment<Form>[]`", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment<Form>[]"],
      direction: "output",
    });
    expect(style.tooltipText).toBe("Segment<Form>[]");
    expect(style.color).toBe("green");
    expect(style.isArray).toBe(true);
  });
});

describe("computeHandleStyle — Scenario 4: multi/gray tooltip explains the indirection", () => {
  it("output side multi-port → 'Multiple outputs — select node to view all'", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment", "OcrResult"],
      direction: "output",
    });
    expect(style.tooltipText).toBe(
      "Multiple outputs — select node to view all",
    );
  });

  it("input side multi-port → 'Multiple inputs — select node to view all'", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment", "OcrResult"],
      direction: "input",
    });
    expect(style.tooltipText).toBe("Multiple inputs — select node to view all");
  });

  it("legacy untyped (zero kinds) on output → same multi-output tooltip", () => {
    const style = computeHandleStyle({
      portKinds: [undefined, undefined],
      direction: "output",
    });
    expect(style.tooltipText).toBe(
      "Multiple outputs — select node to view all",
    );
  });

  it("legacy untyped (zero kinds) on input → same multi-input tooltip", () => {
    const style = computeHandleStyle({
      portKinds: [],
      direction: "input",
    });
    expect(style.tooltipText).toBe("Multiple inputs — select node to view all");
  });
});
