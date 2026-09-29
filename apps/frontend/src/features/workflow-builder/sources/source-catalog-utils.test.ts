/**
 * Smoke tests for `source-catalog-utils.ts` (US-118 Scenario 1 + 5).
 *
 * Verifies the resolver pattern matches the activity-catalog one:
 *   - Known hint strings resolve to real components / tokens.
 *   - Unknown / missing hints return `undefined`.
 *   - `getSourceVisualHints` falls back to a neutral gray + database
 *     icon for unregistered subtypes (mirrors `getActivityVisualHints`'
 *     unknown-entry path).
 */

import {
  IconCloudUpload,
  IconDatabase,
  IconFileUpload,
  IconWorld,
} from "@tabler/icons-react";
import { describe, expect, it } from "vitest";

import { ACTIVITY_ACCENT } from "../node-accents";
import {
  getSourceVisualHints,
  resolveSourceIcon,
} from "./source-catalog-utils";

describe("resolveSourceIcon", () => {
  it("returns IconCloudUpload for the 'cloud-upload' hint (source.api)", () => {
    expect(resolveSourceIcon("cloud-upload")).toBe(IconCloudUpload);
  });

  it("returns IconFileUpload for the 'file-upload' hint (source.upload)", () => {
    expect(resolveSourceIcon("file-upload")).toBe(IconFileUpload);
  });

  it("returns IconWorld for the 'world' hint (reserved for future pull sources)", () => {
    expect(resolveSourceIcon("world")).toBe(IconWorld);
  });

  it("returns IconDatabase for the 'database' hint", () => {
    expect(resolveSourceIcon("database")).toBe(IconDatabase);
  });

  it("returns undefined for an unknown hint", () => {
    expect(resolveSourceIcon("never-seen-this-hint")).toBeUndefined();
  });

  it("returns undefined when the hint is undefined", () => {
    expect(resolveSourceIcon(undefined)).toBeUndefined();
  });

  it("returns undefined for the empty string", () => {
    expect(resolveSourceIcon("")).toBeUndefined();
  });
});

describe("source accents (item 20 — `resolveSourceColor` is gone)", () => {
  /*
   * These used to assert that the `indigo` hint resolved to `#6366f1` and
   * `blue` to `#3b82f6` — two of the exact hexes the colour-vision
   * measurement retired, out of a private copy of the activity palette that
   * had already drifted from it. A source node is a step that does work, so it
   * takes the one working-step accent; which source it is, is carried by its
   * icon and its title, both of which are still asserted above and below.
   */
  it("gives every source subtype the working-step accent", () => {
    expect(getSourceVisualHints("source.upload").color).toBe(ACTIVITY_ACCENT);
    expect(getSourceVisualHints("source.api").color).toBe(ACTIVITY_ACCENT);
  });

  it("gives an unregistered subtype the same accent, not a special one", () => {
    // An unknown source is still a source. It is told apart by its fallback
    // icon and by its raw `sourceType` showing as the display name.
    const hints = getSourceVisualHints("source.not-a-real-subtype");
    expect(hints.color).toBe(ACTIVITY_ACCENT);
    expect(hints.displayName).toBe("source.not-a-real-subtype");
  });
});

describe("getSourceVisualHints", () => {
  it("returns the catalog displayName + icon + colour for source.api", () => {
    const hints = getSourceVisualHints("source.api");
    expect(hints.displayName).toBe("API endpoint");
    expect(hints.Icon).toBe(IconCloudUpload);
    expect(hints.color).toBe(ACTIVITY_ACCENT);
    expect(hints.colorHint).toBe("indigo");
  });

  it("returns the catalog displayName + icon + colour for source.upload", () => {
    const hints = getSourceVisualHints("source.upload");
    expect(hints.displayName).toBe("File upload");
    expect(hints.Icon).toBe(IconFileUpload);
    expect(hints.color).toBe(ACTIVITY_ACCENT);
    expect(hints.colorHint).toBe("blue");
  });

  it("falls back to the working-step accent + IconDatabase for an unregistered subtype", () => {
    const hints = getSourceVisualHints("source.does-not-exist");
    expect(hints.displayName).toBe("source.does-not-exist");
    expect(hints.Icon).toBe(IconDatabase);
    expect(hints.color).toBe(ACTIVITY_ACCENT);
    expect(hints.colorHint).toBeUndefined();
    expect(hints.description).toBe("Unregistered source subtype.");
  });
});
