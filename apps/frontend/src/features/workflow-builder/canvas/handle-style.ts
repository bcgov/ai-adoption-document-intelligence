/**
 * Per-handle styling helper for the visual workflow canvas.
 *
 * The canvas paints one dot per PORT ROW — inputs down the left edge of a card,
 * outputs down the right — and these helpers are what every surface that draws
 * one of those dots agrees through: the port rows themselves, the wires, the
 * legend, the source-node renderer and the standalone kind dot.
 *
 * A dot carries its kind's family TWICE: as a colour and as a silhouette, so a
 * reader who cannot separate two hues can still separate two ports. Cardinality
 * (`T[]`) adds a doubled outline. Both come from `artifact-kind-colour.ts`,
 * which is the single registry for the five families.
 *
 * Dynamically-registered kinds (Phase 6) resolve their colour through the same
 * registry, and an unknown kind falls back to gray.
 */

import type { CSSProperties } from "react";

import {
  type PortShape,
  portDotColor,
  portRingColor,
  shapeForColor,
} from "./artifact-kind-colour";

/**
 * The handle dot's background, resolved from the family token.
 *
 * Shared by the node-level handles (`WorkflowEditorCanvas`), the per-port row
 * handles (`PortRows`), the wires (`WorkflowEdge`) and the legend, so all four
 * paint the same colour by construction.
 *
 * This used to interpolate `var(--mantine-color-${color}-6, ${color})`. It
 * does not any more: the app theme overrides Mantine's `blue`, `gray` and
 * `red` scales, so that indirection silently paid out a different colour than
 * the one the palette was measured against — which is where two of item 20's
 * three drifts came from. The five values live in `PORT_FAMILY`.
 */
export function handleBackground(color: string): string {
  return portDotColor(color);
}

/**
 * Lighter outline tone used to signal array cardinality on a kind-coloured
 * handle dot — a 50% tint of the family's dot colour.
 */
export function handleArrayOutline(color: string): string {
  return portRingColor(color);
}

// ---------------------------------------------------------------------------
// The shape carrier (item 20). Each of the five port families draws a distinct
// silhouette, so a user who cannot separate two hues can still separate two
// ports. See `PortShape` in `artifact-kind-colour.ts` for why none of these
// uses `clip-path`.
//
// Every shape is expressed as a RATIO of the caller's base size rather than as
// fixed pixels, because the dot is not always 12px: it grows to
// `UNCONNECTED_HANDLE_SIZE` when it carries the "+" invitation and to
// `DROP_COMPATIBLE_HANDLE_SIZE` while it is a live drop target. A fixed-pixel
// bar would have squared itself up at both of those sizes.
// ---------------------------------------------------------------------------

/** The canvas's base handle-dot size, matching `workflow-editor-canvas.css`. */
export const BASE_HANDLE_SIZE = 12;

/**
 * Which edge of the node the handle is pinned to, or `null` for a dot that is
 * not an xyflow handle at all (the legend swatch, the per-port pill).
 *
 * It matters for exactly one shape. `diamond` is a rotated square, and xyflow's
 * own `.react-flow__handle-left` / `-right` classes already set a positioning
 * `transform` — `translate(-50%, -50%)` on the left, `translate(50%, -50%)` on
 * the right. An inline `transform` REPLACES that rather than composing with it,
 * so the rotation has to carry the correct translate for its side or the dot
 * jumps half its own width off the anchor.
 */
export type PortSide = "left" | "right" | null;

const SHAPE_RATIO: Record<PortShape, { w: number; h: number }> = {
  circle: { w: 1, h: 1 },
  square: { w: 1, h: 1 },
  // A square rotated 45° presents its DIAGONAL, which is 1.41× its side — so
  // it is drawn smaller than the others to end up the same visual weight.
  diamond: { w: 0.84, h: 0.84 },
  bar: { w: 0.67, h: 1.17 },
  hollow: { w: 1, h: 1 },
};

function translateFor(side: PortSide): string {
  if (side === "left") return "translate(-50%, -50%)";
  if (side === "right") return "translate(50%, -50%)";
  return "";
}

/**
 * The CSS that draws one family's silhouette on a handle dot.
 *
 * Returns width/height/border-radius (and, for `diamond`, a composed
 * transform), so callers spread it and then layer their own state cues —
 * the array outline, the amber needs-a-source ring — on top. Those cues are
 * `outline` and `box-shadow`, both of which follow `border-radius`, so they
 * take the family's shape for free.
 */
export function portShapeStyle(
  shape: PortShape,
  opts: { color: string; size?: number; side?: PortSide },
): CSSProperties {
  const size = opts.size ?? BASE_HANDLE_SIZE;
  const side = opts.side ?? null;
  const ratio = SHAPE_RATIO[shape];
  const base: CSSProperties = {
    width: Math.round(size * ratio.w),
    height: Math.round(size * ratio.h),
  };

  switch (shape) {
    case "circle":
      return { ...base, borderRadius: "50%" };
    case "square":
      return { ...base, borderRadius: 2 };
    case "diamond": {
      const rotate = `${translateFor(side)} rotate(45deg)`.trim();
      return { ...base, borderRadius: 2, transform: rotate };
    }
    case "bar":
      return { ...base, borderRadius: Math.round(size * 0.34) };
    case "hollow":
      // The base CSS already draws a 2px border in the canvas body colour as a
      // knockout ring. Hollow spends that border on the family colour instead
      // and empties the middle — which is the honest picture of a port that
      // has no type to announce.
      return {
        ...base,
        borderRadius: "50%",
        background: "var(--mantine-color-body, #fff)",
        border: `2px solid ${portDotColor(opts.color)}`,
      };
  }
}

// ---------------------------------------------------------------------------
// The "+" invitation on an unconnected port handle.
//
// A bare dot says nothing, so the hover-to-extend popover — the main way a
// graph gets built — is invisible to anyone handed the tool cold. A "+"
// says "there is something to add here".
//
// Three constraints shaped the drawing:
//
//   1. It must not fight the port's family colour, which encodes what can
//      connect to what. So the glyph is drawn in a neutral ink, black or
//      white, never in a hue of its own; only the shape inside the dot
//      changes.
//   2. It must be legible on every family. One ink cannot be: white on the
//      yellow diamond is 1.9:1, and on the untyped dot, which is hollow and
//      filled with the canvas white, it is invisible. So the glyph takes
//      whichever ink contrasts more with the surface it is drawn on (see
//      `plusGlyphColor`).
//   3. It must survive the zoom levels people work at. A glyph INSIDE a ring
//      loses at 16px, because the ring eats the pixel budget. So the plus is
//      not drawn inside the existing 12px dot: an inviting handle grows to
//      `UNCONNECTED_HANDLE_SIZE`, which leaves a 12px disc inside the 2px
//      ring, and the bars span 8 of those 12px at 2px thick. Two thirds of
//      the disc is glyph — the plus is the shape you read, not a detail
//      inside a circle.
//
// Growing the dot via width/height (not `transform: scale()`) is deliberate
// and matches the drop-target highlight in `PortRows` — xyflow's own
// `.react-flow__handle-left/-right` classes apply `translate(-50%, -50%)`,
// whose percentages resolve against the handle's own box, so a bigger box
// stays centred on the same anchor for free.
// ---------------------------------------------------------------------------

/** Dot size for a handle that renders the "+" invitation, in px. */
export const UNCONNECTED_HANDLE_SIZE = 16;
/**
 * Arm length of the "+" on a full-width shape (circle, square, hollow) at
 * `UNCONNECTED_HANDLE_SIZE` — two thirds of the 12px disc inside the 2px ring.
 * The narrower shapes derive a shorter arm; see `plusGlyphBarStyles`.
 */
export const PLUS_GLYPH_ARM = 8;
/** Thickness of each arm of the "+", in px. */
export const PLUS_GLYPH_STROKE = 2;
/**
 * The two inks the "+" can be drawn in. Literal hexes for the same reason the
 * family palette uses them: the contrast worked out here is the contrast on
 * screen.
 */
export const PLUS_GLYPH_INKS = ["#FFFFFF", "#000000"] as const;
/**
 * What a hollow dot is filled with: the canvas body (`portShapeStyle`), which
 * is white in the app's light colour scheme.
 */
const HOLLOW_DOT_FILL = "#FFFFFF";
/** How much of the dot's usable width the "+" spans. */
const PLUS_ARM_RATIO = 0.67;

/** WCAG 2 relative luminance of one 0–255 sRGB channel. */
function linearChannel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 relative luminance of a `#RRGGBB` colour. */
function relativeLuminance(hex: string): number {
  const digits = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) =>
    linearChannel(Number.parseInt(digits.slice(at, at + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two `#RRGGBB` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The surface a family's "+" is drawn on: the family colour inside a filled
 * dot, the canvas body inside the hollow one.
 */
export function plusGlyphSurface(color: string): string {
  return shapeForColor(color) === "hollow"
    ? HOLLOW_DOT_FILL
    : portDotColor(color);
}

/**
 * The ink for a family's "+": whichever of white and black contrasts more with
 * the surface it is drawn on, the rule `colorForFieldKey` also applies to
 * field highlights. That puts white on the violet square (6.3:1) and black on
 * the blue circle (6.7:1), the yellow diamond (11.3:1), the teal bar (6.7:1)
 * and the hollow dot (21:1), so every family's glyph clears 6:1.
 */
export function plusGlyphColor(color: string): string {
  const surface = plusGlyphSurface(color);
  const [light, dark] = PLUS_GLYPH_INKS;
  return contrastRatio(light, surface) >= contrastRatio(dark, surface)
    ? light
    : dark;
}

const PLUS_BAR_BASE: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  borderRadius: 1,
  // The bars are decoration sitting inside a drag target; they must never
  // intercept the pointer events the handle itself needs.
  pointerEvents: "none",
};

/**
 * Inline styles for the two bars that draw the "+" inside one family's handle
 * dot. Rendered as children of the xyflow `<Handle>` (which forwards
 * `children` into the dot element) rather than as a background image, so the
 * glyph is a real, assertable DOM shape at any zoom.
 *
 * The family decides three things, each of which would otherwise stop the
 * "+" being a legible "+":
 *
 *   - **The ink**, from `plusGlyphColor`.
 *   - **The arm length.** A `bar` is two thirds the width of a circle, so a
 *     fixed 8px arm would poke out of both sides of it. The arm is derived
 *     from whichever inner dimension is smaller.
 *   - **A diamond counter-rotates its glyph.** The diamond is a rotated
 *     square, and a rotated element rotates its children — so an untouched
 *     plus would render as a ×, which means "remove", the opposite of what
 *     this glyph is for.
 */
export function plusGlyphBarStyles(
  color: string,
  size: number = UNCONNECTED_HANDLE_SIZE,
): {
  horizontal: CSSProperties;
  vertical: CSSProperties;
} {
  const shape = shapeForColor(color);
  const ratio = SHAPE_RATIO[shape];
  // A diamond's usable area is the square inscribed in it, which is 1/√2 of
  // the side it is drawn at.
  const usable = shape === "diamond" ? Math.SQRT1_2 : 1;
  const inner = Math.min(size * ratio.w, size * ratio.h) * usable - 2 * 2;
  const arm = Math.max(4, Math.round(inner * PLUS_ARM_RATIO));
  const transform =
    shape === "diamond"
      ? "translate(-50%, -50%) rotate(-45deg)"
      : "translate(-50%, -50%)";
  const background = plusGlyphColor(color);

  return {
    horizontal: {
      ...PLUS_BAR_BASE,
      background,
      transform,
      width: arm,
      height: PLUS_GLYPH_STROKE,
    },
    vertical: {
      ...PLUS_BAR_BASE,
      background,
      transform,
      width: PLUS_GLYPH_STROKE,
      height: arm,
    },
  };
}
