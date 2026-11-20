/**
 * Tests for the per-handle styling helpers in `handle-style.ts` — the family
 * colour and its silhouette, the array-cardinality outline, and the "+"
 * invitation drawn on an unconnected port.
 */

import { describe, expect, it } from "vitest";

import { PORT_FAMILIES, shapeForColor } from "./artifact-kind-colour";
import {
  contrastRatio,
  handleArrayOutline,
  handleBackground,
  PLUS_GLYPH_ARM,
  PLUS_GLYPH_INKS,
  PLUS_GLYPH_STROKE,
  plusGlyphBarStyles,
  plusGlyphColor,
  plusGlyphSurface,
  portShapeStyle,
  UNCONNECTED_HANDLE_SIZE,
} from "./handle-style";

describe("plusGlyphBarStyles — the '+' drawn on an unconnected port", () => {
  /**
   * Three properties are load-bearing and none is obvious from reading the
   * styles, so they are pinned here rather than left to a visual check.
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

  it("draws two centred bars that never take the pointer", () => {
    const { horizontal, vertical } = plusGlyphBarStyles("blue");

    expect(horizontal.width).toBe(PLUS_GLYPH_ARM);
    expect(horizontal.height).toBe(PLUS_GLYPH_STROKE);
    expect(vertical.width).toBe(PLUS_GLYPH_STROKE);
    expect(vertical.height).toBe(PLUS_GLYPH_ARM);

    for (const bar of [horizontal, vertical]) {
      expect(bar.background).toBe(plusGlyphColor("blue"));
      expect(bar.position).toBe("absolute");
      expect(bar.left).toBe("50%");
      expect(bar.top).toBe("50%");
      expect(bar.transform).toBe("translate(-50%, -50%)");
      // Decoration sitting inside a drag target must never eat the pointer.
      expect(bar.pointerEvents).toBe("none");
    }
  });
  it("draws the '+' in whichever ink contrasts more with the dot, on every family", () => {
    // One ink cannot serve all five families: white on the yellow diamond is
    // 1.9:1, and on the hollow dot, which is filled with the canvas white, it
    // does not show at all.
    for (const family of PORT_FAMILIES) {
      const surface = plusGlyphSurface(family.token);
      const ink = plusGlyphColor(family.token);
      const other = PLUS_GLYPH_INKS.find((candidate) => candidate !== ink);
      if (!other) throw new Error("expected two inks");
      expect(contrastRatio(ink, surface), family.token).toBeGreaterThanOrEqual(
        contrastRatio(other, surface),
      );
      // Well clear of WCAG's 3:1 for a graphic that carries meaning.
      expect(contrastRatio(ink, surface), family.token).toBeGreaterThan(6);
      const { horizontal, vertical } = plusGlyphBarStyles(family.token);
      expect(horizontal.background).toBe(ink);
      expect(vertical.background).toBe(ink);
    }
  });

  it("draws the '+' on the hollow dot in a colour other than its fill", () => {
    const fill = portShapeStyle("hollow", { color: "gray" }).background;
    expect(fill).toBe("var(--mantine-color-body, #fff)");
    expect(plusGlyphSurface("gray")).toBe("#FFFFFF");
    expect(plusGlyphColor("gray")).toBe("#000000");
  });

  it("measures contrast the WCAG way", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#5595D9", "#5595D9")).toBeCloseTo(1, 5);
    // The violet square is the one family dark enough for white.
    expect(plusGlyphColor("violet")).toBe("#FFFFFF");
    expect(contrastRatio("#FFFFFF", "#6741D9")).toBeCloseTo(6.3, 1);
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
    const { horizontal, vertical } = plusGlyphBarStyles("yellow");
    for (const bar of [horizontal, vertical]) {
      expect(bar.transform).toBe("translate(-50%, -50%) rotate(-45deg)");
    }
  });

  it("shortens the '+' arms to fit the narrower shapes", () => {
    const circle = plusGlyphBarStyles("blue");
    const bar = plusGlyphBarStyles("teal");
    expect(circle.horizontal.width).toBe(PLUS_GLYPH_ARM);
    // A bar is two thirds the width of a circle; an 8px arm would poke out of
    // both of its sides.
    expect(Number(bar.horizontal.width)).toBeLessThan(PLUS_GLYPH_ARM);
    expect(Number(bar.horizontal.width)).toBeGreaterThanOrEqual(4);
  });
});
