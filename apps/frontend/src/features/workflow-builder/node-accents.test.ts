/**
 * Tests for the node accent vocabulary (Inderdeep UX walkthrough 2026-08-06,
 * item 20 — ruled 2026-08-09).
 *
 * The property under test is not "these are the hexes" — a test that restates
 * the constant it reads proves nothing. It is that the accents remain a code a
 * person can actually decode: one value per role, no role sharing a value with
 * a role that means something else, and no accent quietly leaking back into
 * the per-category scheme the measurement retired.
 */

import {
  ACTIVITY_CATALOG,
  getActivityCatalogEntry,
} from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { getActivityVisualHints } from "./catalog-utils";
import { CONTROL_FLOW_VISUAL_HINTS } from "./control-flow-visual-hints";
import {
  ACTIVITY_ACCENT,
  AUTHORED_GROUP_ACCENT,
  MAP_BODY_ACCENT,
  NODE_ACCENTS,
  nodeAccent,
} from "./node-accents";
import { getSourceVisualHints } from "./sources/source-catalog-utils";

describe("node accents — the roles", () => {
  it("gives every role its own colour", () => {
    const colors = NODE_ACCENTS.map((a) => a.color);
    expect(new Set(colors).size).toBe(NODE_ACCENTS.length);
  });

  it("names each role in words a reader can use", () => {
    // The legend and the tooltips render these; an unlabelled colour is the
    // defect this whole item came from.
    for (const accent of NODE_ACCENTS) {
      expect(accent.label.length).toBeGreaterThan(0);
      expect(accent.color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("node accents — every card that does work looks the same", () => {
  it("paints EVERY catalog activity with the one activity accent", () => {
    // The thing that made 13 colours: each activity category had its own.
    // If this ever returns more than one value again, the collisions are back.
    const accents = new Set(
      Object.keys(ACTIVITY_CATALOG).map(
        (type) => getActivityVisualHints(type).color,
      ),
    );
    expect(accents).toEqual(new Set([ACTIVITY_ACCENT]));
  });

  it("paints an activity type the catalog has never heard of the same way", () => {
    expect(getActivityCatalogEntry("nope.not.a.thing")).toBeUndefined();
    expect(getActivityVisualHints("nope.not.a.thing").color).toBe(
      ACTIVITY_ACCENT,
    );
  });

  it("paints source nodes as working steps too", () => {
    // A source fetches or accepts a document — it does work. It used to carry
    // its own two-colour palette, a private copy of the activity one.
    expect(getSourceVisualHints("source.upload").color).toBe(ACTIVITY_ACCENT);
    expect(getSourceVisualHints("source.api").color).toBe(ACTIVITY_ACCENT);
  });
});

describe("node accents — control flow says what it DOES, not which type it is", () => {
  it("gives the two routing types one accent and the two fan types another", () => {
    const by = (type: string) =>
      CONTROL_FLOW_VISUAL_HINTS.find((h) => h.type === type)?.color;

    expect(by("switch")).toBe(nodeAccent("routing"));
    expect(by("pollUntil")).toBe(nodeAccent("routing"));
    expect(by("map")).toBe(nodeAccent("fan"));
    expect(by("join")).toBe(nodeAccent("fan"));
    expect(by("humanGate")).toBe(nodeAccent("person"));
    expect(by("childWorkflow")).toBe(nodeAccent("childWorkflow"));
  });

  it("keeps the two things that mean opposite things apart", () => {
    // `humanGate` red and `join` green simulated to ΔE 8.5 apart under
    // deuteranopia — one colour, on "stop and wait for a person" and "collect
    // the results". They are now in different roles by construction.
    expect(nodeAccent("person")).not.toBe(nodeAccent("fan"));
  });

  it("uses no accent that is not one of the five roles", () => {
    const allowed = new Set(NODE_ACCENTS.map((a) => a.color));
    for (const hint of CONTROL_FLOW_VISUAL_HINTS) {
      expect(allowed.has(hint.color)).toBe(true);
    }
    expect(allowed.has(ACTIVITY_ACCENT)).toBe(true);
  });
});

describe("node accents — group outlines", () => {
  it("gives a map body the same colour as the map node it belongs to", () => {
    // `#22c55e` used to mean the map node, the map body outline, AND an
    // activity category. Two of those three genuinely ARE one thing; the
    // third was a coincidence.
    expect(MAP_BODY_ACCENT).toBe(nodeAccent("fan"));
  });

  it("gives an authored group the neutral, not a colour of its own", () => {
    expect(AUTHORED_GROUP_ACCENT).toBe(ACTIVITY_ACCENT);
    expect(AUTHORED_GROUP_ACCENT).not.toBe(MAP_BODY_ACCENT);
  });
});
