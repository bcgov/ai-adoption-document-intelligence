/**
 * Node accent colours — the 6px left border on a card, the group outline, and
 * the conditional wire that leaves a switch.
 *
 * This is the SECOND colour code on the canvas. The first is the port palette
 * in `canvas/artifact-kind-colour.ts`, which says what a piece of DATA is; this
 * one says what a STEP is. They are read in different places on different
 * elements and are never asked to be compared, so each is measured against
 * itself — which is the only way either can be legible, because you cannot get
 * ten mutually-separable hues under dichromacy.
 *
 * ── Why five, when there were thirteen (item 20, 2026-08-09) ──────────────
 *
 * The old scheme gave every activity CATEGORY its own accent (7 in use across
 * 46 catalog entries) plus one per control-flow type (6). Simulated under
 * deuteranopia and protanopia, those 13 produced **14 pairs below the ΔE ≈ 11
 * collision threshold**, and the worst of them were not marginal:
 *
 *   activity "green" vs map            ΔE 0     — the same hex, `#22c55e`,
 *                                                 which ALSO painted the
 *                                                 map-body group outline:
 *                                                 one colour, three meanings
 *   activity violet vs childWorkflow   ΔE 0.2 (protanopia)
 *   activity indigo vs violet          ΔE 0.7
 *   activity blue vs childWorkflow     ΔE 0.7 (deuteranopia)
 *   humanGate red vs join green        ΔE 8.5  — opposite meanings
 *
 * Thirteen hues cannot be pulled apart; no re-pick of the hexes fixes that.
 * So the count had to come down, and the axis it came down to is the one the
 * canvas already draws: what KIND of step this is. Every activity now shares
 * one calm slate, which means a coloured card is exactly a card that does
 * something structurally unusual — and the activity's category, which the
 * accent used to encode, is still carried by its icon (31 distinct glyphs),
 * its label, and the palette sidebar's own grouping.
 *
 * The five hold a worst pair of **ΔE 12.9** under both deficiencies.
 */

/** What a node accent says about the step it belongs to. */
export type NodeAccentRole =
  | "activity"
  | "routing"
  | "fan"
  | "person"
  | "childWorkflow";

export interface NodeAccent {
  color: string;
  /** How the role is named to a reader — used in the legend and in tooltips. */
  label: string;
}

const ACCENTS: Record<NodeAccentRole, NodeAccent> = {
  /** Does work. The default, and the overwhelming majority of cards. */
  activity: { color: "#64748B", label: "Does work" },
  /** Decides whether or where to go next — `switch`, `pollUntil`. */
  routing: { color: "#D97706", label: "Decides where to go next" },
  /** Changes how many items are in flight — `map`, `join`. */
  fan: { color: "#6B21A8", label: "Fans out or back in" },
  /** Waits for a human — `humanGate`. Its own accent because it is the one
   *  thing an author most needs to spot in a graph. */
  person: { color: "#B91C1C", label: "Waits for a person" },
  /** Hands off to another workflow — `childWorkflow`. */
  childWorkflow: { color: "#065F46", label: "Runs another workflow" },
};

export function nodeAccent(role: NodeAccentRole): string {
  return ACCENTS[role].color;
}

/** Every accent, in legend order. */
export const NODE_ACCENTS: ReadonlyArray<
  NodeAccent & { role: NodeAccentRole }
> = (Object.keys(ACCENTS) as NodeAccentRole[]).map((role) => ({
  role,
  ...ACCENTS[role],
}));

/**
 * The accent for a card that runs a catalog activity.
 *
 * A function of nothing — that is the point. It used to be a function of the
 * entry's `colorHint`, which is why there were seven of these.
 */
export const ACTIVITY_ACCENT = ACCENTS.activity.color;

/**
 * Group container outlines.
 *
 * A map body's outline is the SAME value as the map node's own accent, because
 * it is that node's body — the two things that genuinely are one thing now
 * share one colour, which is the opposite of the old scheme where one colour
 * covered three unrelated things. An authored group is a plain user-made
 * grouping and takes the neutral.
 */
export const MAP_BODY_ACCENT = ACCENTS.fan.color;
export const AUTHORED_GROUP_ACCENT = ACCENTS.activity.color;
