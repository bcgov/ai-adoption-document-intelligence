/**
 * Tests for ConfusionMapEditor (US-033).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-033-confusion-map-editor.md.
 *
 * Scope of US-033: editor for the `ocr.characterConfusion`
 * `customConfusionMap` parameter — a `Record<string, string>` that the UI
 * shows as ordered `{ from, to }` rows for stable editing. The component is
 * responsible for the object → rows → object transform.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfusionMapEditor } from "./ConfusionMapEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ConfusionMap = Record<string, string>;

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Controlled wrapper around ConfusionMapEditor — drives the editor with
 * React state and records the latest `onChange` payload (a `Record`).
 */
function mountWithSpy(initial: ConfusionMap) {
  const spy = vi.fn<(next: ConfusionMap) => void>();

  function Wrapper() {
    const [value, setValue] = useState<ConfusionMap>(initial);
    return (
      <ConfusionMapEditor
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
// Scenario 1: Object → rows on mount
// ---------------------------------------------------------------------------

describe("ConfusionMapEditor — Scenario 1: Object → rows on mount", () => {
  it("renders one row per entry, preserving object insertion order", () => {
    const value: ConfusionMap = { "0": "O", l: "1" };

    renderEditor(
      <ConfusionMapEditor value={value} onChange={() => undefined} />,
    );

    const row0 = screen.getByTestId("confusion-map-editor-row-0");
    const row1 = screen.getByTestId("confusion-map-editor-row-1");

    expect(row0).toBeInTheDocument();
    expect(row1).toBeInTheDocument();

    const from0 = within(row0).getByTestId(
      "confusion-map-editor-from-0",
    ) as HTMLInputElement;
    const to0 = within(row0).getByTestId(
      "confusion-map-editor-to-0",
    ) as HTMLInputElement;
    const from1 = within(row1).getByTestId(
      "confusion-map-editor-from-1",
    ) as HTMLInputElement;
    const to1 = within(row1).getByTestId(
      "confusion-map-editor-to-1",
    ) as HTMLInputElement;

    expect(from0.value).toBe("0");
    expect(to0.value).toBe("O");
    expect(from1.value).toBe("l");
    expect(to1.value).toBe("1");
  });

  it("renders zero rows + an empty-state helper when given an empty object", () => {
    renderEditor(<ConfusionMapEditor value={{}} onChange={() => undefined} />);

    expect(
      screen.queryByTestId("confusion-map-editor-row-0"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("confusion-map-editor-add")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Rows → object on change
// ---------------------------------------------------------------------------

describe("ConfusionMapEditor — Scenario 2: Rows → object on change", () => {
  it("editing a row's `to` value fires onChange with the rebuilt object", () => {
    const { spy } = mountWithSpy({ "0": "O", l: "1" });

    const to0 = screen.getByTestId(
      "confusion-map-editor-to-0",
    ) as HTMLInputElement;
    fireEvent.change(to0, { target: { value: "Q" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    // Payload is an OBJECT, not an array.
    expect(Array.isArray(next)).toBe(false);
    expect(next).toEqual({ "0": "Q", l: "1" });
  });

  it("editing the `from` key renames it in the serialised object", () => {
    const { spy } = mountWithSpy({ "0": "O" });

    const from0 = screen.getByTestId(
      "confusion-map-editor-from-0",
    ) as HTMLInputElement;
    fireEvent.change(from0, { target: { value: "Q" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({ Q: "O" });
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Duplicate `from` keys surface a per-row warning
// ---------------------------------------------------------------------------

describe("ConfusionMapEditor — Scenario 3: Duplicate from keys warn per-row", () => {
  it("the second row with the same `from` shows an inline warning", () => {
    // Seed via two empty rows then type the same `from` into both — that's
    // the realistic way to land in this state since an external `value`
    // already collapses duplicates by definition.
    const { spy } = mountWithSpy({});

    fireEvent.click(screen.getByTestId("confusion-map-editor-add"));
    fireEvent.click(screen.getByTestId("confusion-map-editor-add"));

    const from0 = screen.getByTestId(
      "confusion-map-editor-from-0",
    ) as HTMLInputElement;
    const from1 = screen.getByTestId(
      "confusion-map-editor-from-1",
    ) as HTMLInputElement;
    const to0 = screen.getByTestId(
      "confusion-map-editor-to-0",
    ) as HTMLInputElement;
    const to1 = screen.getByTestId(
      "confusion-map-editor-to-1",
    ) as HTMLInputElement;

    fireEvent.change(from0, { target: { value: "0" } });
    fireEvent.change(to0, { target: { value: "O" } });
    fireEvent.change(from1, { target: { value: "0" } });
    fireEvent.change(to1, { target: { value: "Q" } });

    // Row 0 has no warning (it's the first occurrence of "0").
    expect(
      screen.queryByTestId("confusion-map-editor-warning-0"),
    ).not.toBeInTheDocument();

    // Row 1 has a duplicate-key warning.
    const warning = screen.getByTestId("confusion-map-editor-warning-1");
    expect(warning).toBeInTheDocument();
    expect(warning.textContent ?? "").toMatch(/duplicate key/i);

    // onChange still fires — validation is surface-only. The last write wins
    // on duplicate keys (Object.fromEntries semantics).
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({ "0": "Q" });
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Empty `from` rows are skipped on onChange
// ---------------------------------------------------------------------------

describe("ConfusionMapEditor — Scenario 4: empty `from` rows are dropped", () => {
  it("a row with an empty `from` value is not included in the serialised object", () => {
    const { spy } = mountWithSpy({ "0": "O" });

    // Add a second row; its `from` is "" by default.
    fireEvent.click(screen.getByTestId("confusion-map-editor-add"));

    // Edit the new row's `to` only — leave `from` empty.
    const to1 = screen.getByTestId(
      "confusion-map-editor-to-1",
    ) as HTMLInputElement;
    fireEvent.change(to1, { target: { value: "X" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    // The empty-from row is dropped.
    expect(next).toEqual({ "0": "O" });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Add / remove rows
// ---------------------------------------------------------------------------

describe("ConfusionMapEditor — Scenario 5: Add / remove rows", () => {
  it("clicking Add pair appends a fresh empty row to the UI", () => {
    mountWithSpy({ "0": "O" });

    fireEvent.click(screen.getByTestId("confusion-map-editor-add"));

    const row1 = screen.getByTestId("confusion-map-editor-row-1");
    expect(row1).toBeInTheDocument();

    const from1 = within(row1).getByTestId(
      "confusion-map-editor-from-1",
    ) as HTMLInputElement;
    const to1 = within(row1).getByTestId(
      "confusion-map-editor-to-1",
    ) as HTMLInputElement;

    expect(from1.value).toBe("");
    expect(to1.value).toBe("");
  });

  it("clicking the trash on a row removes it and propagates the rebuilt object", () => {
    const { spy } = mountWithSpy({ "0": "O", l: "1" });

    expect(
      screen.getByTestId("confusion-map-editor-row-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("confusion-map-editor-row-1"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("confusion-map-editor-remove-0"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({ l: "1" });

    // The remaining row is now at index 0.
    const from0 = screen.getByTestId(
      "confusion-map-editor-from-0",
    ) as HTMLInputElement;
    expect(from0.value).toBe("l");
  });

  it("trash on the last remaining row is enabled (catalog allows empty `Record`)", () => {
    renderEditor(
      <ConfusionMapEditor value={{ "0": "O" }} onChange={() => undefined} />,
    );

    const remove = screen.getByTestId("confusion-map-editor-remove-0");
    expect(remove).toBeEnabled();
  });
});
