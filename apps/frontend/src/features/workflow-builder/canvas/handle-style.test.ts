/**
 * Tests for `computeHandleStyle` — the pure helper that translates a
 * node side's declared `KindRef` list into the canvas handle's colour
 * + cardinality outline + hover tooltip text (US-095).
 *
 * Each test maps to one acceptance scenario from
 * feature-docs/20260529-workflow-builder-phase3-typed-io-artifacts/user_stories/US-095-handle-colour-and-tooltip.md.
 */

import { describe, expect, it } from "vitest";

import { PORT_FAMILIES, shapeForColor } from "./artifact-kind-colour";
import {
  computeHandleStyle,
  handleArrayOutline,
  handleBackground,
  PLUS_GLYPH_ARM,
  PLUS_GLYPH_COLOR,
  PLUS_GLYPH_STROKE,
  plusGlyphBarStyles,
  portShapeStyle,
  UNCONNECTED_HANDLE_SIZE,
} from "./handle-style";

describe("computeHandleStyle — Scenario 1: single typed port is coloured by kind", () => {
  it("colours a single `Segment[]` output handle violet with doubled outline + verbatim tooltip", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment[]"],
      direction: "output",
    });
    expect(style.color).toBe("violet");
    expect(style.shape).toBe("square");
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
    expect(style.shape).toBe("circle");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(false);
    expect(style.tooltipText).toBe("Document");
  });

  it("colours a single `OcrResult` output handle violet — the SAME family as Segment", () => {
    const style = computeHandleStyle({
      portKinds: ["OcrResult"],
      direction: "output",
    });
    // Item 20 merged Segment and OcrResult into one "content out of a
    // document" family. Both are violet squares; the kind literal in the
    // tooltip is what still tells them apart.
    expect(style.color).toBe("violet");
    expect(style.shape).toBe("square");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(false);
    expect(style.tooltipText).toBe("OcrResult");
  });

  it("colours a single `Classification` output handle yellow — a judgement, not content", () => {
    const style = computeHandleStyle({
      portKinds: ["Classification"],
      direction: "output",
    });
    expect(style.color).toBe("yellow");
    expect(style.shape).toBe("diamond");
    expect(style.tooltipText).toBe("Classification");
  });

  it("colours a single `Reference` input handle teal — the pointer family, with Identifier", () => {
    const style = computeHandleStyle({
      portKinds: ["Reference"],
      direction: "input",
    });
    expect(style.color).toBe("teal");
    expect(style.shape).toBe("bar");
    expect(style.tooltipText).toBe("Reference");
  });

  it("puts an Identifier in the same pointer family as a Reference", () => {
    // These were cyan and teal respectively, and simulated to ΔE 6.9 apart
    // under protanopia — one dot. They are one family now, on purpose.
    const identifier = computeHandleStyle({
      portKinds: ["DocumentId"],
      direction: "input",
    });
    expect(identifier.color).toBe("teal");
    expect(identifier.shape).toBe("bar");
    expect(identifier.tooltipText).toBe("DocumentId");
  });

  it("ignores `undefined` entries when counting typed ports — a single typed + N untyped still colours by the lone typed port", () => {
    const style = computeHandleStyle({
      portKinds: [undefined, "Segment", undefined],
      direction: "input",
    });
    expect(style.color).toBe("violet");
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
    expect(style.shape).toBe("hollow");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(true);
  });

  it("only undefined entries → gray + isMultiPort: true (every port lacks `kind`)", () => {
    const style = computeHandleStyle({
      portKinds: [undefined, undefined, undefined],
      direction: "input",
    });
    expect(style.color).toBe("gray");
    expect(style.shape).toBe("hollow");
    expect(style.isArray).toBe(false);
    expect(style.isMultiPort).toBe(true);
  });

  it("two typed kinds → gray (no 'primary port' selection)", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment", "OcrResult"],
      direction: "input",
    });
    expect(style.color).toBe("gray");
    expect(style.shape).toBe("hollow");
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
    expect(style.color).toBe("violet");
    expect(style.isArray).toBe(false);
  });

  it("renders a parameterised array kind verbatim — `Segment<Form>[]`", () => {
    const style = computeHandleStyle({
      portKinds: ["Segment<Form>[]"],
      direction: "output",
    });
    expect(style.tooltipText).toBe("Segment<Form>[]");
    expect(style.color).toBe("violet");
    expect(style.shape).toBe("square");
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

  it("zero typed kinds on output → 'No typed outputs' (not 'Multiple')", () => {
    const style = computeHandleStyle({
      portKinds: [undefined, undefined],
      direction: "output",
    });
    expect(style.tooltipText).toBe("No typed outputs");
    expect(style.isMultiPort).toBe(true);
  });

  it("zero typed kinds on input → 'No typed inputs' (not 'Multiple')", () => {
    const style = computeHandleStyle({
      portKinds: [],
      direction: "input",
    });
    expect(style.tooltipText).toBe("No typed inputs");
    expect(style.isMultiPort).toBe(true);
  });
});

describe("plusGlyphBarStyles — the '+' drawn on an unconnected port", () => {
  /**
   * Inderdeep UX walkthrough 2026-08-06, item 3. Two properties are
   * load-bearing and neither is obvious from reading the styles, so they are
   * pinned here rather than left to a visual check.
   */

  it("keeps the glyph big enough to survive a zoomed-out canvas", () => {
    // The batch-1 status-badge finding was that a glyph INSIDE a ring loses
    // at 16px, because the ring spends the pixel budget. So the plus is not
    // squeezed into the base 12px dot: the dot grows, the 2px body ring
    // leaves a 12px disc, and the arms take 8 of those 12px — two thirds of
    // the disc is glyph. If any of these three numbers drifts, the shape
    // stops reading and this is the test that says so.
    expect(UNCONNECTED_HANDLE_SIZE).toBe(16);
    const innerDisc = UNCONNECTED_HANDLE_SIZE - 2 * 2; // dot minus the body ring
    expect(PLUS_GLYPH_ARM / innerDisc).toBeGreaterThanOrEqual(0.6);
    expect(PLUS_GLYPH_STROKE).toBe(2);
  });

  it("draws two centred bars in the body colour, so the port's family hue is untouched", () => {
    const { horizontal, vertical } = plusGlyphBarStyles();

    expect(horizontal.width).toBe(PLUS_GLYPH_ARM);
    expect(horizontal.height).toBe(PLUS_GLYPH_STROKE);
    expect(vertical.width).toBe(PLUS_GLYPH_STROKE);
    expect(vertical.height).toBe(PLUS_GLYPH_ARM);

    for (const bar of [horizontal, vertical]) {
      // A knockout, not a tint: the bars are the canvas body colour, the same
      // tone as the dot's own ring, so the kind colour (which encodes what can
      // connect to what) still reads as itself.
      expect(bar.background).toBe(PLUS_GLYPH_COLOR);
      expect(bar.position).toBe("absolute");
      expect(bar.left).toBe("50%");
      expect(bar.top).toBe("50%");
      expect(bar.transform).toBe("translate(-50%, -50%)");
      // Decoration sitting inside a drag target must never eat the pointer.
      expect(bar.pointerEvents).toBe("none");
    }
  });
});

// ---------------------------------------------------------------------------
// The shape carrier (Inderdeep item 20, 2026-08-09)
// ---------------------------------------------------------------------------

describe("the port families carry a shape as well as a colour", () => {
  it("gives each of the five families a DIFFERENT silhouette", () => {
    // This is the whole point of the carrier: if two families ever share a
    // shape, the merge has removed a distinction without replacing it, and a
    // user who cannot separate the two hues has nothing left to read.
    const shapes = PORT_FAMILIES.map((f) => f.shape);
    expect(new Set(shapes).size).toBe(PORT_FAMILIES.length);
  });

  it("gives each family a different colour, as a literal hex", () => {
    const dots = PORT_FAMILIES.map((f) => f.dot);
    expect(new Set(dots).size).toBe(PORT_FAMILIES.length);
    // Literals, never `var(--mantine-color-…)`. The app theme overrides
    // Mantine's blue/gray/red scales, so a variable here would pay out a
    // different colour than the one the palette was measured against — which
    // is where three of item 20's drifts came from.
    for (const family of PORT_FAMILIES) {
      expect(family.dot).toMatch(/^#[0-9A-F]{6}$/);
      expect(family.ring).toMatch(/^#[0-9A-F]{6}$/);
      expect(handleBackground(family.token)).toBe(family.dot);
      expect(handleArrayOutline(family.token)).toBe(family.ring);
    }
  });

  it("falls back to the untyped grey circle for a token it does not know", () => {
    // A dynamically registered kind may declare any colour string. It gets the
    // wildcard rather than inventing a sixth family nothing can explain.
    expect(handleBackground("chartreuse")).toBe(handleBackground("gray"));
    expect(shapeForColor("chartreuse")).toBe("hollow");
  });
});

describe("portShapeStyle", () => {
  it("composes the diamond's rotation with the side's own translate", () => {
    // xyflow's `.react-flow__handle-left`/`-right` classes already set a
    // positioning transform, and an inline transform REPLACES it rather than
    // composing. Drop the translate and the dot jumps half its width off the
    // node edge — on the left and the right by different amounts, because the
    // two classes translate differently.
    expect(
      portShapeStyle("diamond", { color: "yellow", side: "left" }).transform,
    ).toBe("translate(-50%, -50%) rotate(45deg)");
    expect(
      portShapeStyle("diamond", { color: "yellow", side: "right" }).transform,
    ).toBe("translate(50%, -50%) rotate(45deg)");
    // A swatch in the legend is not an xyflow handle and carries no translate.
    expect(portShapeStyle("diamond", { color: "yellow" }).transform).toBe(
      "rotate(45deg)",
    );
  });

  it("keeps the bar a bar when the dot grows", () => {
    // The dot grows to `UNCONNECTED_HANDLE_SIZE` when it carries the "+" and
    // again while it is a live drop target. Fixed pixels would have squared
    // the bar up at both sizes and quietly deleted the pointer family's shape.
    const base = portShapeStyle("bar", { color: "teal" });
    const grown = portShapeStyle("bar", {
      color: "teal",
      size: UNCONNECTED_HANDLE_SIZE,
    });
    expect(Number(base.height)).toBeGreaterThan(Number(base.width));
    expect(Number(grown.height)).toBeGreaterThan(Number(grown.width));
    expect(Number(grown.width)).toBeGreaterThan(Number(base.width));
  });

  it("empties the untyped dot and spends its border on the family colour", () => {
    const style = portShapeStyle("hollow", { color: "gray" });
    expect(style.background).toBe("var(--mantine-color-body, #fff)");
    expect(style.border).toBe(`2px solid ${handleBackground("gray")}`);
  });

  it("draws the '+' upright inside a diamond instead of as an ×", () => {
    // The diamond is a rotated square and a rotated element rotates its
    // children, so an untouched plus renders as ×  — which means "remove",
    // the opposite of what the invitation is for.
    const { horizontal, vertical } = plusGlyphBarStyles("diamond");
    for (const bar of [horizontal, vertical]) {
      expect(bar.transform).toBe("translate(-50%, -50%) rotate(-45deg)");
    }
  });

  it("shortens the '+' arms to fit the narrower shapes", () => {
    const circle = plusGlyphBarStyles("circle");
    const bar = plusGlyphBarStyles("bar");
    expect(circle.horizontal.width).toBe(PLUS_GLYPH_ARM);
    // A bar is two thirds the width of a circle; an 8px arm would poke out of
    // both of its sides.
    expect(Number(bar.horizontal.width)).toBeLessThan(PLUS_GLYPH_ARM);
    expect(Number(bar.horizontal.width)).toBeGreaterThanOrEqual(4);
  });
});
