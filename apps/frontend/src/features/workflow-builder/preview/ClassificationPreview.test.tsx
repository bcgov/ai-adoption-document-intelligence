/**
 * Unit tests for `ClassificationPreview` (US-145 Phase 4 Milestone D).
 *
 * Each `describe` block maps to a scenario from
 * feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-145-classification-preview.md.
 *
 * The widget renders Mantine primitives only — no network, no
 * `RunStateContext` — so each test wraps in `<MantineProvider>` and
 * asserts via `data-testid` markers.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { ClassificationPreview } from "./ClassificationPreview";

function renderWithMantine(ui: ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Mantine `<Progress>` renders the colour via a CSS variable on the
 * inner `<div role="progressbar">` (e.g.
 * `--progress-section-color: var(--mantine-color-green-filled)`).
 * Extract the bare colour name (`green` / `yellow` / `red`) so tests
 * can assert against it without coupling to the full CSS expression.
 */
function progressColor(barRoot: HTMLElement): string {
  const section = barRoot.querySelector<HTMLElement>('[role="progressbar"]');
  if (section === null) return "";
  const style = section.getAttribute("style") ?? "";
  const m =
    /--progress-section-color:\s*var\(--mantine-color-([a-z]+)-filled\)/.exec(
      style,
    );
  return m === null ? "" : m[1];
}

function progressValueNow(barRoot: HTMLElement): number {
  const section = barRoot.querySelector<HTMLElement>('[role="progressbar"]');
  if (section === null) return Number.NaN;
  const v = section.getAttribute("aria-valuenow");
  return v === null ? Number.NaN : Number(v);
}

// ---------------------------------------------------------------------------
// Scenario 1 — base render + malformed fallback
// ---------------------------------------------------------------------------

describe("Scenario 1 — base render + malformed fallback", () => {
  it("renders pill + bar for a valid Classification object", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "INVOICE", confidence: 0.87 }} />,
    );
    expect(screen.getByTestId("classification-label")).toHaveTextContent(
      "INVOICE",
    );
    expect(screen.getByTestId("classification-bar")).toBeInTheDocument();
  });

  it("renders 'No classification result' when value is null", () => {
    renderWithMantine(<ClassificationPreview value={null} />);
    expect(screen.getByText("No classification result")).toBeInTheDocument();
  });

  it("renders 'No classification result' when value lacks label/confidence", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "X" /* no confidence */ }} />,
    );
    expect(screen.getByText("No classification result")).toBeInTheDocument();
  });

  it("renders 'No classification result' for a primitive", () => {
    renderWithMantine(<ClassificationPreview value="oops" />);
    expect(screen.getByText("No classification result")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — label pill + confidence bar layout
// ---------------------------------------------------------------------------

describe("Scenario 2 — label pill + confidence bar layout", () => {
  it("shows label, '87%' text, and matched-by rule line", () => {
    renderWithMantine(
      <ClassificationPreview
        value={{
          label: "INVOICE",
          confidence: 0.87,
          ruleName: "vendor-invoice-keyword-match",
        }}
      />,
    );
    expect(screen.getByTestId("classification-label")).toHaveTextContent(
      "INVOICE",
    );
    expect(screen.getByTestId("classification-percent")).toHaveTextContent(
      "87%",
    );
    expect(screen.getByTestId("classification-rule")).toHaveTextContent(
      "matched by: vendor-invoice-keyword-match",
    );
  });

  it("hides the matched-by line when ruleName is absent", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "INVOICE", confidence: 0.87 }} />,
    );
    expect(screen.queryByTestId("classification-rule")).not.toBeInTheDocument();
  });

  it("hides the matched-by line when ruleName is empty string", () => {
    renderWithMantine(
      <ClassificationPreview
        value={{ label: "INVOICE", confidence: 0.87, ruleName: "" }}
      />,
    );
    expect(screen.queryByTestId("classification-rule")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — confidence colour bands
// ---------------------------------------------------------------------------

describe("Scenario 3 — confidence colour bands", () => {
  it("uses green for confidence >= 0.8", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "A", confidence: 0.9 }} />,
    );
    expect(progressColor(screen.getByTestId("classification-bar"))).toBe(
      "green",
    );
  });

  it("uses yellow (amber) for 0.5 <= confidence < 0.8", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "A", confidence: 0.65 }} />,
    );
    expect(progressColor(screen.getByTestId("classification-bar"))).toBe(
      "yellow",
    );
  });

  it("uses red for confidence < 0.5", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "A", confidence: 0.25 }} />,
    );
    expect(progressColor(screen.getByTestId("classification-bar"))).toBe("red");
  });

  it("uses green for the exact 0.8 boundary", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "A", confidence: 0.8 }} />,
    );
    expect(progressColor(screen.getByTestId("classification-bar"))).toBe(
      "green",
    );
  });

  it("uses yellow for the exact 0.5 boundary", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "A", confidence: 0.5 }} />,
    );
    expect(progressColor(screen.getByTestId("classification-bar"))).toBe(
      "yellow",
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — multi-result arrays
// ---------------------------------------------------------------------------

describe("Scenario 4 — multi-result arrays", () => {
  it("renders the top-confidence entry prominently", () => {
    renderWithMantine(
      <ClassificationPreview
        value={[
          { label: "RECEIPT", confidence: 0.65 },
          { label: "INVOICE", confidence: 0.87 },
        ]}
      />,
    );
    // Top entry is the highest-confidence one (INVOICE @ 0.87).
    const labels = screen.getAllByTestId("classification-label");
    expect(labels[0]).toHaveTextContent("INVOICE");
  });

  it("shows a '+N more' chip listing the remaining count", () => {
    renderWithMantine(
      <ClassificationPreview
        value={[
          { label: "INVOICE", confidence: 0.87 },
          { label: "RECEIPT", confidence: 0.65 },
          { label: "FORM", confidence: 0.4 },
        ]}
      />,
    );
    expect(screen.getByTestId("classification-more-chip")).toHaveTextContent(
      "+2 more",
    );
  });

  it("opens a popover with all results sorted by confidence desc", async () => {
    renderWithMantine(
      <ClassificationPreview
        value={[
          { label: "FORM", confidence: 0.4 },
          { label: "INVOICE", confidence: 0.87 },
          { label: "RECEIPT", confidence: 0.65 },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("classification-more-chip"));
    const popover = await screen.findByTestId("classification-more-popover");
    const labels = within(popover).getAllByTestId("classification-label");
    expect(labels.map((el) => el.textContent)).toEqual([
      "INVOICE",
      "RECEIPT",
      "FORM",
    ]);
  });

  it("renders single-element array without a '+N more' chip", () => {
    renderWithMantine(
      <ClassificationPreview
        value={[{ label: "INVOICE", confidence: 0.87 }]}
      />,
    );
    expect(
      screen.queryByTestId("classification-more-chip"),
    ).not.toBeInTheDocument();
  });

  it("renders 'No classification result' for empty arrays", () => {
    renderWithMantine(<ClassificationPreview value={[]} />);
    expect(screen.getByText("No classification result")).toBeInTheDocument();
  });

  it("renders 'No classification result' for arrays of malformed entries", () => {
    renderWithMantine(
      <ClassificationPreview value={[{ label: "X" }, "oops", null]} />,
    );
    expect(screen.getByText("No classification result")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — confidence rendering edge cases
// ---------------------------------------------------------------------------

describe("Scenario 5 — confidence rendering edge cases", () => {
  it("displays raw value '150%' for confidence > 1 but clamps bar to 100", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "OVER", confidence: 1.5 }} />,
    );
    expect(screen.getByTestId("classification-percent")).toHaveTextContent(
      "150%",
    );
    expect(
      progressValueNow(screen.getByTestId("classification-bar")),
    ).toBeLessThanOrEqual(100);
  });

  it("displays raw negative value and clamps bar to 0", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "NEG", confidence: -0.2 }} />,
    );
    expect(screen.getByTestId("classification-percent")).toHaveTextContent(
      "-20%",
    );
    expect(progressValueNow(screen.getByTestId("classification-bar"))).toBe(0);
  });

  it("renders '—' label and red bar for NaN confidence", () => {
    renderWithMantine(
      <ClassificationPreview value={{ label: "BAD", confidence: NaN }} />,
    );
    expect(screen.getByTestId("classification-percent")).toHaveTextContent("—");
    expect(progressColor(screen.getByTestId("classification-bar"))).toBe("red");
    expect(progressValueNow(screen.getByTestId("classification-bar"))).toBe(0);
  });
});
