/**
 * Tests for ClassificationRuleEditor (US-037 + US-038).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/US-037-classification-rule-editor-shell.md
 * and US-038-classification-rule-pattern-rows.md.
 *
 * - US-037 scope: the list shell only — add / remove rules, header inputs
 *   for `name` and `resultType`, and dispatch to the pattern-row body.
 * - US-038 scope: the per-rule `ClassificationPatternRows` body — Select
 *   inputs for `scope` / `operator`, a TextInput for `value`, and add /
 *   remove pattern rows.
 *
 * The component imports `ClassificationRule` from `@ai-di/graph-workflow`
 * (the catalog's Zod schema is the single source of truth).
 */

import "@testing-library/jest-dom";

import type { ClassificationRule } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ClassificationRuleEditor } from "./ClassificationRuleEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function mountWithSpy(initial: ClassificationRule[]) {
  const spy = vi.fn<(next: ClassificationRule[]) => void>();

  function Wrapper() {
    const [value, setValue] = useState<ClassificationRule[]>(initial);
    return (
      <ClassificationRuleEditor
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

// ===========================================================================
// US-037 — list shell scenarios
// ===========================================================================

// ---------------------------------------------------------------------------
// US-037 Scenario 1: empty + add — clicking "Add rule" appends a default rule
// ---------------------------------------------------------------------------

describe("ClassificationRuleEditor — US-037 Scenario 1: empty + add", () => {
  it("fires onChange with one default rule containing one default pattern", () => {
    const { spy } = mountWithSpy([]);

    fireEvent.click(screen.getByTestId("classification-rule-editor-add"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as ClassificationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      name: "",
      resultType: "",
      patterns: [
        {
          // First scope/operator enum from the catalog.
          scope: "fullText",
          operator: "contains",
          value: "",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// US-037 Scenario 2: each row exposes name + resultType + the pattern body
// ---------------------------------------------------------------------------

describe("ClassificationRuleEditor — US-037 Scenario 2: row exposes name + resultType + pattern body", () => {
  it("renders the name + resultType TextInputs (both required) and the patterns body", () => {
    const rules: ClassificationRule[] = [
      {
        name: "invoice-rule",
        resultType: "invoice",
        patterns: [{ scope: "fullText", operator: "contains", value: "INV-" }],
      },
    ];

    renderEditor(
      <ClassificationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const row0 = screen.getByTestId("classification-rule-editor-row-0");

    // name + resultType inputs render and carry the asterisk via Mantine
    // `withAsterisk`.
    const requiredTestIds = [
      "classification-rule-editor-name-0",
      "classification-rule-editor-result-type-0",
    ];
    for (const testId of requiredTestIds) {
      const control = within(row0).getByTestId(testId);
      const wrapper = control.closest(".mantine-InputWrapper-root");
      expect(wrapper).not.toBeNull();
      expect(wrapper?.textContent ?? "").toContain("*");
    }

    // Patterns body mounts (US-038's ClassificationPatternRows).
    expect(
      within(row0).getByTestId("classification-pattern-rows-0"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-037 Scenario 3: removing a rule shrinks the list
// ---------------------------------------------------------------------------

describe("ClassificationRuleEditor — US-037 Scenario 3: removing a rule shrinks the list", () => {
  it("clicking the trash icon on row 0 fires onChange with only the second rule", () => {
    const rules: ClassificationRule[] = [
      {
        name: "first",
        resultType: "invoice",
        patterns: [{ scope: "fullText", operator: "contains", value: "A" }],
      },
      {
        name: "second",
        resultType: "receipt",
        patterns: [{ scope: "title", operator: "startsWith", value: "B" }],
      },
    ];

    const { spy } = mountWithSpy(rules);

    fireEvent.click(screen.getByTestId("classification-rule-editor-remove-0"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as ClassificationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual(rules[1]);
  });
});

// ---------------------------------------------------------------------------
// US-037 Scenario 4: root testid for routing tests
// ---------------------------------------------------------------------------

describe("ClassificationRuleEditor — US-037 Scenario 4: root carries data-testid", () => {
  it("renders the root with data-testid=classification-rule-editor", () => {
    renderEditor(
      <ClassificationRuleEditor value={[]} onChange={() => undefined} />,
    );

    expect(
      screen.getByTestId("classification-rule-editor"),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// US-038 — per-rule pattern rows scenarios
// ===========================================================================

// ---------------------------------------------------------------------------
// US-038 Scenario 1: renders one row per pattern (scope/operator/value)
// ---------------------------------------------------------------------------

describe("ClassificationPatternRows — US-038 Scenario 1: one row per pattern", () => {
  it("renders scope Select, operator Select, and value TextInput pre-filled from value", () => {
    const rules: ClassificationRule[] = [
      {
        name: "rule-1",
        resultType: "invoice",
        patterns: [{ scope: "fullText", operator: "contains", value: "INV-" }],
      },
    ];

    renderEditor(
      <ClassificationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const body = screen.getByTestId("classification-pattern-rows-0");

    // Scope select pre-filled
    const scope = within(body).getByTestId("classification-pattern-scope-0-0");
    expect(scope).toBeInTheDocument();

    // Operator select pre-filled
    const operator = within(body).getByTestId(
      "classification-pattern-operator-0-0",
    );
    expect(operator).toBeInTheDocument();

    // Value TextInput pre-filled
    const valueInput = within(body).getByTestId(
      "classification-pattern-value-0-0",
    ) as HTMLInputElement;
    expect(valueInput.value).toBe("INV-");

    // Value is required — `withAsterisk`.
    const valueWrapper = valueInput.closest(".mantine-InputWrapper-root");
    expect(valueWrapper).not.toBeNull();
    expect(valueWrapper?.textContent ?? "").toContain("*");
  });
});

// ---------------------------------------------------------------------------
// US-038 Scenario 2: enums come from the catalog
// ---------------------------------------------------------------------------

describe("ClassificationPatternRows — US-038 Scenario 2: enums come from the catalog", () => {
  it("scope Select lists all six PATTERN_SCOPES and operator Select lists all three PATTERN_OPERATORS", () => {
    const rules: ClassificationRule[] = [
      {
        name: "rule-1",
        resultType: "invoice",
        patterns: [{ scope: "fullText", operator: "contains", value: "" }],
      },
    ];

    renderEditor(
      <ClassificationRuleEditor value={rules} onChange={() => undefined} />,
    );

    // scope: fullText / title / paragraph / section / keyValueKey / keyValueValue
    const scope = screen.getByTestId("classification-pattern-scope-0-0");
    fireEvent.click(scope);
    expect(screen.getByText("fullText")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("paragraph")).toBeInTheDocument();
    expect(screen.getByText("section")).toBeInTheDocument();
    expect(screen.getByText("keyValueKey")).toBeInTheDocument();
    expect(screen.getByText("keyValueValue")).toBeInTheDocument();

    // operator: contains / startsWith / matches
    const operator = screen.getByTestId("classification-pattern-operator-0-0");
    fireEvent.click(operator);
    expect(screen.getByText("contains")).toBeInTheDocument();
    expect(screen.getByText("startsWith")).toBeInTheDocument();
    expect(screen.getByText("matches")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-038 Scenario 3: add + remove pattern rows; trash disabled at len=1
// ---------------------------------------------------------------------------

describe("ClassificationPatternRows — US-038 Scenario 3: add/remove pattern rows", () => {
  it("Add pattern appends a default row; trash on the last remaining row is disabled (catalog min(1))", () => {
    const initial: ClassificationRule[] = [
      {
        name: "rule-1",
        resultType: "invoice",
        patterns: [{ scope: "fullText", operator: "contains", value: "INV-" }],
      },
    ];

    const { spy } = mountWithSpy(initial);

    // Last remaining row's trash should be disabled.
    const trash = screen.getByTestId("classification-pattern-remove-0-0");
    expect(trash).toBeDisabled();

    // Click Add pattern.
    fireEvent.click(screen.getByTestId("classification-pattern-add-0"));

    const afterAdd = spy.mock.lastCall?.[0] as ClassificationRule[];
    expect(afterAdd).toHaveLength(1);
    expect(afterAdd[0].patterns).toEqual([
      { scope: "fullText", operator: "contains", value: "INV-" },
      { scope: "fullText", operator: "contains", value: "" },
    ]);

    // Both trash icons should now be enabled.
    expect(
      screen.getByTestId("classification-pattern-remove-0-0"),
    ).not.toBeDisabled();
    expect(
      screen.getByTestId("classification-pattern-remove-1-0"),
    ).not.toBeDisabled();

    // Click trash on row 1 — patterns should shrink back to one entry.
    fireEvent.click(screen.getByTestId("classification-pattern-remove-1-0"));

    const afterRemove = spy.mock.lastCall?.[0] as ClassificationRule[];
    expect(afterRemove[0].patterns).toEqual([
      { scope: "fullText", operator: "contains", value: "INV-" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// US-038 Scenario 4: edits propagate up, preserving other fields
// ---------------------------------------------------------------------------

describe("ClassificationPatternRows — US-038 Scenario 4: edits propagate up", () => {
  it("changing operator preserves the rule's name + resultType + other patterns and the other fields of the edited pattern", () => {
    const initial: ClassificationRule[] = [
      {
        name: "rule-1",
        resultType: "invoice",
        patterns: [{ scope: "title", operator: "contains", value: "Invoice" }],
      },
    ];

    const { spy } = mountWithSpy(initial);

    // Open the operator select for the only pattern row.
    fireEvent.click(screen.getByTestId("classification-pattern-operator-0-0"));
    fireEvent.click(screen.getByText("startsWith"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ClassificationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      name: "rule-1",
      resultType: "invoice",
      patterns: [{ scope: "title", operator: "startsWith", value: "Invoice" }],
    });
  });
});
