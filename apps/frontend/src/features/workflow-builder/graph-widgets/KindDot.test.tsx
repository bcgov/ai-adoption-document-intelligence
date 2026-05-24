/**
 * Tests for `KindDot` (US-100 — small coloured dot for typed-I/O kinds).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KindDot } from "./KindDot";

function renderDot(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("KindDot — Scenario A: known kind renders a span with the registry's palette colour", () => {
  it('renders <span data-kind-dot="Document"> with the blue palette colour as background', () => {
    const { container } = renderDot(<KindDot kind="Document" />);
    const dot = container.querySelector('[data-kind-dot="Document"]');
    expect(dot).not.toBeNull();
    const style = (dot as HTMLElement).style;
    expect(style.background).toContain("--mantine-color-blue-6");
  });

  it("renders the registry colour for the Segment kind (green)", () => {
    const { container } = renderDot(<KindDot kind="Segment" />);
    const dot = container.querySelector('[data-kind-dot="Segment"]');
    expect(dot).not.toBeNull();
    const style = (dot as HTMLElement).style;
    expect(style.background).toContain("--mantine-color-green-6");
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

describe("KindDot — Scenario C: array kind reuses the base kind's colour", () => {
  it('"Document[]" → blue (the base kind\'s colour)', () => {
    const { container } = renderDot(<KindDot kind="Document[]" />);
    const dot = container.querySelector('[data-kind-dot="Document[]"]');
    expect(dot).not.toBeNull();
    const style = (dot as HTMLElement).style;
    expect(style.background).toContain("--mantine-color-blue-6");
  });

  it('"Segment[]" → green (the base kind\'s colour)', () => {
    const { container } = renderDot(<KindDot kind="Segment[]" />);
    const dot = container.querySelector('[data-kind-dot="Segment[]"]');
    expect(dot).not.toBeNull();
    const style = (dot as HTMLElement).style;
    expect(style.background).toContain("--mantine-color-green-6");
  });
});

describe("KindDot — Scenario D: Artifact root kind renders gray", () => {
  it('renders gray for the root "Artifact" kind (the wildcard, also gray in the registry)', () => {
    const { container } = renderDot(<KindDot kind="Artifact" />);
    const dot = container.querySelector('[data-kind-dot="Artifact"]');
    expect(dot).not.toBeNull();
    const style = (dot as HTMLElement).style;
    expect(style.background).toContain("--mantine-color-gray-6");
  });
});
