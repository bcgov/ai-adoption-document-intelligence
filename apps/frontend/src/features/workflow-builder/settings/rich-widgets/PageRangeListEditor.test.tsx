/**
 * Tests for PageRangeListEditor (US-031).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-031-page-range-list-editor.md.
 *
 * Scope of US-031: row editor for `{ start, end }` page ranges with
 * per-row validation (`start <= end`), 1-based positive integers via
 * Mantine's `NumberInput min={1}`, and add/remove controls (trash
 * disabled on the last remaining row since the catalog schema requires
 * `min(1)` on `customRanges`).
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PageRangeListEditor } from "./PageRangeListEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PageRange = { start: number; end: number };

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Wrapper that drives the editor with a controlled state + a spy for the
 * latest `onChange` payload.
 */
function mountWithSpy(initial: PageRange[]) {
  const spy = vi.fn<(next: PageRange[]) => void>();

  function Wrapper() {
    const [value, setValue] = useState<PageRange[]>(initial);
    return (
      <PageRangeListEditor
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
// Scenario 1: Renders one row per existing range
// ---------------------------------------------------------------------------

describe("PageRangeListEditor — Scenario 1: renders one row per existing range", () => {
  it("renders two rows with the bounds pre-filled when given two ranges", () => {
    const value: PageRange[] = [
      { start: 1, end: 4 },
      { start: 5, end: 10 },
    ];

    renderEditor(
      <PageRangeListEditor value={value} onChange={() => undefined} />,
    );

    const row0 = screen.getByTestId("page-range-list-editor-row-0");
    const row1 = screen.getByTestId("page-range-list-editor-row-1");

    expect(row0).toBeInTheDocument();
    expect(row1).toBeInTheDocument();

    const start0 = within(row0).getByTestId(
      "page-range-list-editor-start-0",
    ) as HTMLInputElement;
    const end0 = within(row0).getByTestId(
      "page-range-list-editor-end-0",
    ) as HTMLInputElement;
    const start1 = within(row1).getByTestId(
      "page-range-list-editor-start-1",
    ) as HTMLInputElement;
    const end1 = within(row1).getByTestId(
      "page-range-list-editor-end-1",
    ) as HTMLInputElement;

    expect(start0.value).toBe("1");
    expect(end0.value).toBe("4");
    expect(start1.value).toBe("5");
    expect(end1.value).toBe("10");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Add / remove row controls
// ---------------------------------------------------------------------------

describe("PageRangeListEditor — Scenario 2: Add / remove row controls", () => {
  it("clicking Add range appends a default { start: 1, end: 1 } row", () => {
    const { spy } = mountWithSpy([{ start: 1, end: 4 }]);

    fireEvent.click(screen.getByTestId("page-range-list-editor-add"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as PageRange[];
    expect(next).toEqual([
      { start: 1, end: 4 },
      { start: 1, end: 1 },
    ]);
  });

  it("trash on the last remaining row is disabled (catalog requires min(1))", () => {
    renderEditor(
      <PageRangeListEditor
        value={[{ start: 1, end: 4 }]}
        onChange={() => undefined}
      />,
    );

    const remove = screen.getByTestId("page-range-list-editor-remove-0");
    expect(remove).toBeDisabled();
  });

  it("trash is enabled when more than one row exists; clicking it removes that row", () => {
    const { spy } = mountWithSpy([
      { start: 1, end: 4 },
      { start: 5, end: 10 },
    ]);

    const remove0 = screen.getByTestId("page-range-list-editor-remove-0");
    expect(remove0).toBeEnabled();

    fireEvent.click(remove0);

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as PageRange[];
    expect(next).toEqual([{ start: 5, end: 10 }]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: `start <= end` per-row validation
// ---------------------------------------------------------------------------

describe("PageRangeListEditor — Scenario 3: start <= end per-row validation", () => {
  it("shows an inline error when end < start and still propagates the value", () => {
    const { spy } = mountWithSpy([{ start: 5, end: 5 }]);

    // No error initially (start === end is OK).
    expect(
      screen.queryByTestId("page-range-list-editor-error-0"),
    ).not.toBeInTheDocument();

    const endInput = screen.getByTestId(
      "page-range-list-editor-end-0",
    ) as HTMLInputElement;
    fireEvent.change(endInput, { target: { value: "3" } });

    // onChange fires with the new value even though end < start.
    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as PageRange[];
    expect(next).toEqual([{ start: 5, end: 3 }]);

    // The error is rendered.
    const error = screen.getByTestId("page-range-list-editor-error-0");
    expect(error).toBeInTheDocument();
    expect(error.textContent ?? "").toMatch(
      /End must be greater than or equal to start/i,
    );
  });

  it("does not show the error when end === start", () => {
    renderEditor(
      <PageRangeListEditor
        value={[{ start: 4, end: 4 }]}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.queryByTestId("page-range-list-editor-error-0"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: `start` and `end` are 1-based positive integers (min=1)
// ---------------------------------------------------------------------------

describe("PageRangeListEditor — Scenario 4: 1-based positive integers", () => {
  it("typing 0 into start does not commit a value below 1 (Mantine clamps via min=1)", () => {
    const { spy } = mountWithSpy([{ start: 1, end: 4 }]);

    const startInput = screen.getByTestId(
      "page-range-list-editor-start-0",
    ) as HTMLInputElement;

    // Type "0" — Mantine's NumberInput should clamp this to the configured
    // minimum (1). It must NOT propagate 0 (or any number < 1) through
    // onChange.
    fireEvent.change(startInput, { target: { value: "0" } });

    // Verify the spy never received a payload whose start is below 1.
    for (const call of spy.mock.calls) {
      const payload = call[0];
      for (const row of payload) {
        expect(row.start).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
