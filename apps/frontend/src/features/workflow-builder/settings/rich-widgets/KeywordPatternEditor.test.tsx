/**
 * Tests for KeywordPatternEditor (US-035).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-035-keyword-pattern-editor.md.
 *
 * Scope of US-035: editor for the `document.splitAndClassify`
 * `keywordPatterns` parameter — a list of `{ pattern, segmentType }` rows.
 * `pattern` is validated as a regex on blur via `new RegExp(pattern)` in a
 * try/catch; the row surfaces an inline error with the JS error message
 * when the regex doesn't compile (`onChange` still propagates the invalid
 * value — Zod remains the source of truth at save time).
 * `segmentType` is a free-form required string. The catalog schema
 * requires `min(1)` patterns so trash on the last remaining row is
 * disabled.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { KeywordPatternEditor } from "./KeywordPatternEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type KeywordPattern = { pattern: string; segmentType: string };

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Controlled wrapper around KeywordPatternEditor — drives the editor with
 * React state and records the latest `onChange` payload.
 */
function mountWithSpy(initial: KeywordPattern[]) {
  const spy = vi.fn<(next: KeywordPattern[]) => void>();

  function Wrapper() {
    const [value, setValue] = useState<KeywordPattern[]>(initial);
    return (
      <KeywordPatternEditor
        value={value}
        onChange={(next) => {
          spy(next);
          setValue(next);
        }}
      />
    );
  }

  const utils = renderEditor(<Wrapper />);
  return { ...utils, spy };
}

// ---------------------------------------------------------------------------
// Scenario 1: Renders one row per pattern
// ---------------------------------------------------------------------------

describe("KeywordPatternEditor — Scenario 1: renders one row per pattern", () => {
  it("renders one row with the pattern + segmentType pre-filled", () => {
    const value: KeywordPattern[] = [
      { pattern: "(?i)pay\\s*stub", segmentType: "pay-stub" },
    ];

    renderEditor(
      <KeywordPatternEditor value={value} onChange={() => undefined} />,
    );

    const row0 = screen.getByTestId("keyword-pattern-editor-row-0");
    expect(row0).toBeInTheDocument();

    const pattern0 = within(row0).getByTestId(
      "keyword-pattern-editor-pattern-0",
    ) as HTMLInputElement;
    const segmentType0 = within(row0).getByTestId(
      "keyword-pattern-editor-segment-type-0",
    ) as HTMLInputElement;

    expect(pattern0.value).toBe("(?i)pay\\s*stub");
    expect(segmentType0.value).toBe("pay-stub");
  });

  it("renders multiple rows in order", () => {
    const value: KeywordPattern[] = [
      { pattern: "alpha", segmentType: "a" },
      { pattern: "beta", segmentType: "b" },
    ];

    renderEditor(
      <KeywordPatternEditor value={value} onChange={() => undefined} />,
    );

    expect(
      screen.getByTestId("keyword-pattern-editor-row-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("keyword-pattern-editor-row-1"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Invalid regex surfaces an inline error per row (on blur)
// ---------------------------------------------------------------------------

describe("KeywordPatternEditor — Scenario 2: invalid regex surfaces an inline error", () => {
  it("typing an invalid regex and blurring shows the JS error inline; onChange still propagates the value", () => {
    const { spy } = mountWithSpy([{ pattern: "alpha", segmentType: "a" }]);

    const patternInput = screen.getByTestId(
      "keyword-pattern-editor-pattern-0",
    ) as HTMLInputElement;

    // Type an invalid regex.
    fireEvent.change(patternInput, { target: { value: "(unclosed" } });

    // onChange propagated the invalid value.
    expect(spy).toHaveBeenCalled();
    const lastBeforeBlur = spy.mock.lastCall?.[0];
    expect(lastBeforeBlur).toEqual([
      { pattern: "(unclosed", segmentType: "a" },
    ]);

    // No inline error yet — validation runs on blur, not on every keystroke.
    expect(
      screen.queryByTestId("keyword-pattern-editor-error-0"),
    ).not.toBeInTheDocument();

    // Blur the input → validation runs.
    fireEvent.blur(patternInput);

    const error = screen.getByTestId("keyword-pattern-editor-error-0");
    expect(error).toBeInTheDocument();
    // The error text should include the JS RegExp error message. We don't
    // pin the exact wording (engine-dependent) but assert it's non-empty.
    expect((error.textContent ?? "").length).toBeGreaterThan(0);
  });

  it("does not show an error for a valid regex after blur", () => {
    // Use a JS-valid regex (JS RegExp does NOT support `(?i)` inline
    // flags — those would compile-error). The catalog accepts the regex
    // source string and the consumer code is free to add the `i` flag.
    mountWithSpy([{ pattern: "pay\\s*stub", segmentType: "pay-stub" }]);

    const patternInput = screen.getByTestId(
      "keyword-pattern-editor-pattern-0",
    ) as HTMLInputElement;

    fireEvent.blur(patternInput);

    expect(
      screen.queryByTestId("keyword-pattern-editor-error-0"),
    ).not.toBeInTheDocument();
  });

  it("clears the error when the user fixes the regex and blurs again", () => {
    mountWithSpy([{ pattern: "alpha", segmentType: "a" }]);

    const patternInput = screen.getByTestId(
      "keyword-pattern-editor-pattern-0",
    ) as HTMLInputElement;

    fireEvent.change(patternInput, { target: { value: "(unclosed" } });
    fireEvent.blur(patternInput);

    expect(
      screen.getByTestId("keyword-pattern-editor-error-0"),
    ).toBeInTheDocument();

    fireEvent.change(patternInput, { target: { value: "(fixed)" } });
    fireEvent.blur(patternInput);

    expect(
      screen.queryByTestId("keyword-pattern-editor-error-0"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: `segmentType` is a free-form required string
// ---------------------------------------------------------------------------

describe("KeywordPatternEditor — Scenario 3: segmentType is a free-form required string", () => {
  it("the segmentType input is a plain TextInput marked withAsterisk", () => {
    renderEditor(
      <KeywordPatternEditor
        value={[{ pattern: "", segmentType: "" }]}
        onChange={() => undefined}
      />,
    );

    const row0 = screen.getByTestId("keyword-pattern-editor-row-0");
    // `withAsterisk` renders a span with a `*` adjacent to the label —
    // Mantine's stable contract. We assert via the label text containing
    // the required marker.
    expect(within(row0).getByText("Segment type")).toBeInTheDocument();
    // The required asterisk appears as a span next to the label.
    const labels = within(row0).getAllByText("*");
    // One asterisk per required field — pattern + segmentType — so at
    // least two on the row.
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it("typing into segmentType propagates the new value", () => {
    const { spy } = mountWithSpy([{ pattern: "alpha", segmentType: "" }]);

    const segmentTypeInput = screen.getByTestId(
      "keyword-pattern-editor-segment-type-0",
    ) as HTMLInputElement;

    fireEvent.change(segmentTypeInput, { target: { value: "pay-stub" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual([{ pattern: "alpha", segmentType: "pay-stub" }]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Add / remove rows
// ---------------------------------------------------------------------------

describe("KeywordPatternEditor — Scenario 4: Add / remove rows", () => {
  it("clicking Add pattern appends a default { pattern: '', segmentType: '' } row", () => {
    const { spy } = mountWithSpy([{ pattern: "alpha", segmentType: "a" }]);

    fireEvent.click(screen.getByTestId("keyword-pattern-editor-add"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual([
      { pattern: "alpha", segmentType: "a" },
      { pattern: "", segmentType: "" },
    ]);
  });

  it("trash on the last remaining row is disabled (catalog requires min(1))", () => {
    renderEditor(
      <KeywordPatternEditor
        value={[{ pattern: "alpha", segmentType: "a" }]}
        onChange={() => undefined}
      />,
    );

    const remove = screen.getByTestId("keyword-pattern-editor-remove-0");
    expect(remove).toBeDisabled();
  });

  it("trash is enabled when more than one row exists; clicking it removes that row", () => {
    const { spy } = mountWithSpy([
      { pattern: "alpha", segmentType: "a" },
      { pattern: "beta", segmentType: "b" },
    ]);

    const remove0 = screen.getByTestId("keyword-pattern-editor-remove-0");
    expect(remove0).toBeEnabled();

    fireEvent.click(remove0);

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual([{ pattern: "beta", segmentType: "b" }]);
  });
});
