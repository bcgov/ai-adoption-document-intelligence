/**
 * Shared helpers for working with `ARTIFACT_REGISTRY` kinds. Reused by the
 * canvas pills, source renderer, handle-style helper, and KindDot widget so
 * those surfaces never drift on either element extraction or colour mapping.
 */

import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";

/**
 * Strip a `T[]` suffix from a `KindRef`, returning the element kind so the
 * registry lookup resolves through the family root. `Segment[]` → `Segment`.
 * Non-array kinds pass through unchanged.
 */
export function elementKindOf(kind: KindRef): string {
  return kind.endsWith("[]") ? kind.slice(0, -2) : kind;
}

/**
 * Split a `KindRef` into its base kind + array-cardinality flag.
 * `"Segment[]"` → `{ baseKind: "Segment", isArray: true }`.
 * `"Document"`  → `{ baseKind: "Document", isArray: false }`.
 */
export function splitKindRef(kind: KindRef): {
  baseKind: string;
  isArray: boolean;
} {
  if (kind.endsWith("[]")) {
    return { baseKind: kind.slice(0, -2), isArray: true };
  }
  return { baseKind: kind, isArray: false };
}

/**
 * Resolve the family token for a kind via the live registry. Falls back to
 * `"gray"` for the `Artifact` wildcard and for unknown kinds.
 *
 * The return value is one of the five `PortFamilyToken`s below, and it is a
 * TOKEN, not a Mantine colour name — read it through `portDotColor` /
 * `portRingColor` / `shapeForColor` rather than interpolating it into a
 * `--mantine-color-*` variable, or you will get a different colour than the
 * canvas paints. See `PORT_FAMILY` for why.
 */
export function colorForKind(kind: KindRef | undefined): string {
  if (kind === undefined) return "gray";
  const meta = getArtifactKindMeta(elementKindOf(kind));
  return meta?.color ?? "gray";
}

// ---------------------------------------------------------------------------
// The port vocabulary — five families, each with a colour AND a shape
// (Inderdeep UX walkthrough 2026-08-06, item 20; ruled 2026-08-09).
//
// "I have been wondering what do these colours mean … there are like 12 to 13
// of them." He counted the legend, which really did render 13 rows. The canvas
// underneath was worse: 32 distinct hex values carrying ~24 meanings.
//
// Two things are fixed here, and they had to ship together.
//
//   1. SEVEN port families became FOUR typed + grey. The seven collided under
//      colour-vision deficiency — References teal vs Untyped grey came out at
//      ΔE 5.2 with a 1.06:1 luminance ratio, i.e. the same dot. The five
//      families below hold a worst pair of ΔE 14.2 under both deuteranopia and
//      protanopia (Viénot 1999 simulation, CIEDE2000 distance). Anything under
//      ΔE ≈ 11 reads as one colour.
//
//   2. Each family carries a SHAPE, so colour is never the only signal. That
//      is the half that makes the merge honest: shipping the merge alone would
//      remove distinctions without replacing them. The shape says the same
//      thing the colour says — the vocabulary is five, not five-times-five.
//
// The hexes are LITERALS on purpose, not `var(--mantine-color-<token>-6)`.
// Three of the drifts item 20 found came from exactly that indirection: the
// app theme overrides Mantine's `blue`, `gray` and `red` scales, so code
// written against stock Mantine painted a different colour than it read. These
// five values were chosen by measurement and must not move when the theme does.
// ---------------------------------------------------------------------------

/** The five family tokens. `ArtifactKindMeta.color` is always one of these. */
export type PortFamilyToken = "blue" | "violet" | "yellow" | "teal" | "gray";

/**
 * The non-chromatic carrier drawn on the port dot itself.
 *
 * Four filled silhouettes plus a hollow one, all legible at the canvas's 12px
 * dot — which is the real constraint, and the reason there are four typed
 * families and not six. `bar` is a vertical lozenge; `hollow` is an unfilled
 * circle, which is what "this port takes anything" should look like.
 *
 * None of them uses `clip-path`, deliberately: the array double-outline and
 * the amber needs-a-source ring are drawn with `outline` and `box-shadow`, and
 * `clip-path` would clip both away. `diamond` is a rotated square for the same
 * reason.
 */
export type PortShape = "circle" | "square" | "diamond" | "bar" | "hollow";

export interface PortFamily {
  /** The dot, the wire and the arrowhead. */
  dot: string;
  /** Lighter tone for the `T[]` cardinality outline. */
  ring: string;
  shape: PortShape;
  /** What the family means, in the legend's words. */
  label: string;
  /** How the shape is named to a screen reader and in the legend. */
  shapeLabel: string;
}

const PORT_FAMILY: Record<PortFamilyToken, PortFamily> = {
  blue: {
    dot: "#5595D9",
    ring: "#AACAEC",
    shape: "circle",
    label: "Documents & files",
    shapeLabel: "circle",
  },
  violet: {
    dot: "#6741D9",
    ring: "#B3A0EC",
    shape: "square",
    label: "Content taken out of a document",
    shapeLabel: "square",
  },
  yellow: {
    dot: "#FAB005",
    ring: "#FCD782",
    shape: "diamond",
    label: "Judgements about a document",
    shapeLabel: "diamond",
  },
  teal: {
    dot: "#0CA678",
    ring: "#85D2BB",
    shape: "bar",
    label: "Pointers — IDs and lookups",
    shapeLabel: "bar",
  },
  gray: {
    dot: "#605E5C",
    ring: "#AFAEAD",
    shape: "hollow",
    label: "Untyped — takes anything",
    shapeLabel: "hollow circle",
  },
};

/** Every family, in legend order. */
export const PORT_FAMILIES: ReadonlyArray<
  PortFamily & { token: PortFamilyToken }
> = (Object.keys(PORT_FAMILY) as PortFamilyToken[]).map((token) => ({
  token,
  ...PORT_FAMILY[token],
}));

/**
 * Resolve a family token to its entry. Anything not one of the five — a
 * dynamically registered kind that declared its own colour, say — falls back
 * to the untyped grey circle rather than inventing a sixth family.
 */
export function portFamilyFor(color: string): PortFamily {
  return PORT_FAMILY[color as PortFamilyToken] ?? PORT_FAMILY.gray;
}

/** The family's dot/wire colour. */
export function portDotColor(color: string): string {
  return portFamilyFor(color).dot;
}

/** The family's lighter `T[]` outline tone. */
export function portRingColor(color: string): string {
  return portFamilyFor(color).ring;
}

/** The family's non-chromatic carrier. */
export function shapeForColor(color: string): PortShape {
  return portFamilyFor(color).shape;
}
