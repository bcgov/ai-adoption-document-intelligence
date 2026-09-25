/**
 * Tests for `KindDot` (US-100 — small coloured dot for typed-I/O kinds).
 *
 * Rewritten for the item-20 port vocabulary (2026-08-09). Two things changed
 * underneath every assertion here:
 *
 *   1. The dot carries a SHAPE as well as a colour, stamped as
 *      `data-kind-shape` beside `data-kind-color`. Both are asserted, because
 *      the shape is the half of the signal that survives colour-vision
 *      deficiency — a test that only checks the hue would pass on a dot that
 *      had silently lost its silhouette.
 *   2. The colours are literal hexes from `PORT_FAMILY`, not
 *      `var(--mantine-color-<token>-6)`. The app theme overrides Mantine's
 *      blue/gray scales, so the old variable indirection painted a different
 *      colour than the palette was measured against. Nothing here hardcodes a
 *      hex: assertions read `portDotColor(...)` and compare through `rgbOf`.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { portDotColor } from "../canvas/artifact-kind-colour";
import { KindDot } from "./KindDot";

/**
 * jsdom's CSSOM normalises every colour it parses to `rgb(r, g, b)`, so an
 * inline `background: #5595D9` reads back as `rgb(85, 149, 217)`. This
 * converts a family hex from the shared palette into the form jsdom reports,
 * so the tests can compare against `portDotColor(...)` instead of pasting a
 * literal the palette would have to be edited in two places to change.
 */
function rgbOf(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) =>
    Number.parseInt(value.slice(i, i + 2), 16),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

function renderDot(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("KindDot — Scenario A: known kind renders a span with the registry's family colour + shape", () => {
  it('renders <span data-kind-dot="Document"> as the blue Documents circle', () => {
    const { container } = renderDot(<KindDot kind="Document" />);
    const dot = container.querySelector('[data-kind-dot="Document"]');
    expect(dot).not.toBeNull();
    const el = dot as HTMLElement;
    // Documents & files: blue, drawn as a circle.
    expect(el.getAttribute("data-kind-color")).toBe("blue");
    expect(el.getAttribute("data-kind-shape")).toBe("circle");
    expect(el.style.background).toBe(rgbOf(portDotColor("blue")));
  });

  it("renders Segment as the violet square — the Segment family merged into violet", () => {
    // Item 20: `Segment*` was its own green family and `Ocr*` was violet. Both
    // mean "content taken out of a document", so they are now ONE family —
    // violet, square. `green` is no longer a family token at all.
    const { container } = renderDot(<KindDot kind="Segment" />);
    const dot = container.querySelector('[data-kind-dot="Segment"]');
    expect(dot).not.toBeNull();
    const el = dot as HTMLElement;
    expect(el.getAttribute("data-kind-color")).toBe("violet");
    expect(el.getAttribute("data-kind-shape")).toBe("square");
    expect(el.style.background).toBe(rgbOf(portDotColor("violet")));
  });

  it("draws Segment and OcrResult identically — one family — and tells them apart by the kind literal", () => {
    // The merge is deliberate, so the honest assertion is that the two dots
    // AGREE. What still distinguishes the ports is the kind literal, which the
    // dot stamps as `data-kind-dot` and every surface around it renders as
    // text (row label, tooltip, pill).
    const { container } = renderDot(
      <>
        <KindDot kind="Segment" />
        <KindDot kind="OcrResult" />
      </>,
    );
    const segment = container.querySelector(
      '[data-kind-dot="Segment"]',
    ) as HTMLElement;
    const ocr = container.querySelector(
      '[data-kind-dot="OcrResult"]',
    ) as HTMLElement;
    expect(ocr.getAttribute("data-kind-color")).toBe(
      segment.getAttribute("data-kind-color"),
    );
    expect(ocr.getAttribute("data-kind-shape")).toBe(
      segment.getAttribute("data-kind-shape"),
    );
    expect(ocr.style.background).toBe(segment.style.background);
    // …and the kinds themselves are still separable.
    expect(segment.getAttribute("data-kind-dot")).toBe("Segment");
    expect(ocr.getAttribute("data-kind-dot")).toBe("OcrResult");
  });
});

describe("KindDot — Scenario B: undefined kind renders nothing (legacy / wildcard)", () => {
  it("returns null when kind is undefined — no [data-kind-dot] element in the tree", () => {
    const { container } = renderDot(<KindDot kind={undefined} />);
    // MantineProvider injects a <style data-mantine-styles> sibling, so we
    // assert specifically on the absence of the KindDot's marker attribute
    // rather than on `container.firstChild`.
    expect(container.querySelector("[data-kind-dot]")).toBeNull();
  });
});

describe("KindDot — Scenario C: array kind reuses the base kind's family", () => {
  it('"Document[]" → the blue circle (the base kind\'s family)', () => {
    const { container } = renderDot(<KindDot kind="Document[]" />);
    const dot = container.querySelector('[data-kind-dot="Document[]"]');
    expect(dot).not.toBeNull();
    const el = dot as HTMLElement;
    expect(el.getAttribute("data-kind-color")).toBe("blue");
    expect(el.getAttribute("data-kind-shape")).toBe("circle");
    expect(el.style.background).toBe(rgbOf(portDotColor("blue")));
  });

  it('"Segment[]" → the violet square (the base kind\'s family)', () => {
    const { container } = renderDot(<KindDot kind="Segment[]" />);
    const dot = container.querySelector('[data-kind-dot="Segment[]"]');
    expect(dot).not.toBeNull();
    const el = dot as HTMLElement;
    expect(el.getAttribute("data-kind-color")).toBe("violet");
    expect(el.getAttribute("data-kind-shape")).toBe("square");
    expect(el.style.background).toBe(rgbOf(portDotColor("violet")));
  });
});

describe("KindDot — Scenario D: Artifact root kind renders the gray hollow dot", () => {
  it('renders the untyped wildcard "Artifact" as a hollow circle outlined in the gray family colour', () => {
    const { container } = renderDot(<KindDot kind="Artifact" />);
    const dot = container.querySelector('[data-kind-dot="Artifact"]');
    expect(dot).not.toBeNull();
    const el = dot as HTMLElement;
    expect(el.getAttribute("data-kind-color")).toBe("gray");
    expect(el.getAttribute("data-kind-shape")).toBe("hollow");
    // The gray family is the one shape that is NOT filled: `portShapeStyle`
    // empties the middle to the canvas body colour and spends the border on
    // the family colour, which is what "this port takes anything" should look
    // like. So the family hex lives on the border here, not the background.
    expect(el.style.background).toContain("--mantine-color-body");
    expect(el.style.border).toContain(rgbOf(portDotColor("gray")));
  });
});
