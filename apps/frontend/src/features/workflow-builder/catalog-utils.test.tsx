/**
 * Tests for `catalog-utils` — P-7, node icons move from emoji to Tabler.
 *
 * The point of the change is that nothing on an icon surface is a
 * platform-dependent glyph any more, so the assertions are about the
 * *contract* (every hint resolves to a renderable component that emits an
 * SVG) rather than about which particular icon a given hint picked.
 */

import "@testing-library/jest-dom";

import { ACTIVITY_CATALOG } from "@ai-di/graph-workflow";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CATEGORY_ORDER,
  getActivityVisualHints,
  getCatalogByCategory,
  isUserFacingActivity,
} from "./catalog-utils";

/** Matches any emoji / pictographic codepoint. */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

describe("getActivityVisualHints — icons", () => {
  it("resolves every catalogued activity to a component that draws an SVG", () => {
    for (const activityType of Object.keys(ACTIVITY_CATALOG)) {
      const { Icon } = getActivityVisualHints(activityType);
      const { container, unmount } = render(<Icon size={16} />);
      expect(container.querySelector("svg")).not.toBeNull();
      expect(container.textContent ?? "").toBe("");
      unmount();
    }
  });

  it("renders an SVG rather than a text glyph", () => {
    const { Icon } = getActivityVisualHints("file.prepare");
    const { container } = render(<Icon size={16} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.textContent ?? "").not.toMatch(PICTOGRAPHIC);
  });

  it("honours the size prop the call sites pass", () => {
    const { Icon } = getActivityVisualHints("file.prepare");
    const { container } = render(<Icon size={14} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "14");
  });

  it("gives distinct icons to distinct icon hints", () => {
    const prepare = getActivityVisualHints("file.prepare").Icon;
    const split = getActivityVisualHints("document.split").Icon;
    expect(prepare).not.toBe(split);
  });

  it("gives the same icon to two activities sharing an icon hint", () => {
    // Both carry iconHint "hourglass".
    const ocrPoll = getActivityVisualHints("azure.ocr.poll").Icon;
    const classifyPoll = getActivityVisualHints("azure.classify.poll").Icon;
    expect(ocrPoll).toBe(classifyPoll);
  });

  it("falls back to a renderable icon for an unregistered activity", () => {
    const hints = getActivityVisualHints("not.a.real.activity");
    expect(hints.displayName).toBe("not.a.real.activity");
    expect(hints.category).toBe("Unknown");
    expect(hints.description).toBe("Unregistered activity.");
    const { container } = render(<hints.Icon size={16} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("keeps the fallback icon distinct from a mapped one", () => {
    const unknown = getActivityVisualHints("not.a.real.activity").Icon;
    const known = getActivityVisualHints("file.prepare").Icon;
    expect(unknown).not.toBe(known);
  });
});

describe("getActivityVisualHints — colours and copy", () => {
  it("resolves the catalog colour hint to a hex token", () => {
    expect(getActivityVisualHints("file.prepare").color).toMatch(
      /^#[0-9a-f]{6}$/i,
    );
  });

  it("carries the catalog display name and description through", () => {
    const entry = ACTIVITY_CATALOG["file.prepare"];
    const hints = getActivityVisualHints("file.prepare");
    expect(hints.displayName).toBe(entry.displayName ?? entry.activityType);
    expect(hints.description).toBe(entry.description);
    expect(hints.category).toBe(entry.category);
  });

  it("carries no pictographic characters in any display string", () => {
    for (const activityType of Object.keys(ACTIVITY_CATALOG)) {
      const hints = getActivityVisualHints(activityType);
      expect(hints.displayName).not.toMatch(PICTOGRAPHIC);
      expect(hints.description).not.toMatch(PICTOGRAPHIC);
    }
  });
});

describe("getCatalogByCategory", () => {
  it("hides Benchmarking from the user-facing palette", () => {
    expect(getCatalogByCategory().Benchmarking).toBeUndefined();
    expect(isUserFacingActivity("benchmark.evaluate")).toBe(false);
    expect(isUserFacingActivity("file.prepare")).toBe(true);
  });

  it("sorts each category by display name", () => {
    for (const list of Object.values(getCatalogByCategory())) {
      const names = list.map((e) => e.displayName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("only lists categories the palette knows how to order", () => {
    for (const category of Object.keys(getCatalogByCategory())) {
      expect(CATEGORY_ORDER).toContain(category);
    }
  });
});
