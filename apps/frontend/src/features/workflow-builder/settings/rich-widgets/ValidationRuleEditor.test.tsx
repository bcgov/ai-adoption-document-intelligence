/**
 * Tests for ValidationRuleEditor (US-027).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/user_stories/US-027-validation-rule-editor-shell.md.
 *
 * Scope of US-027: the list shell only — add / remove / variant-switch /
 * dispatch to body sub-components. Body editors for each variant land in
 * US-028 (field-match + arithmetic) and US-029 (array-match) so this test
 * file only asserts that the right body test-id mounts per row.
 */

import "@testing-library/jest-dom";

import type { ValidationRule } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ValidationRuleEditor } from "./ValidationRuleEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Wrapper that drives the editor with a controlled state + a spy for the
 * latest `onChange` payload.
 */
function mountWithSpy(initial: ValidationRule[]) {
  const spy = vi.fn<(next: ValidationRule[]) => void>();

  function Wrapper() {
    const [value, setValue] = useState<ValidationRule[]>(initial);
    return (
      <ValidationRuleEditor
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
// Scenario 1: empty list shows helper line + Add rule button
// ---------------------------------------------------------------------------

describe("ValidationRuleEditor — Scenario 1: empty state", () => {
  it("renders the helper line and an enabled Add rule button when value is []", () => {
    renderEditor(
      <ValidationRuleEditor value={[]} onChange={() => undefined} />,
    );

    expect(screen.getByText(/No rules — click Add rule/i)).toBeInTheDocument();

    const addButton = screen.getByTestId("validation-rule-editor-add");
    expect(addButton).toBeInTheDocument();
    expect(addButton).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: clicking Add rule appends a default field-match rule
// ---------------------------------------------------------------------------

describe("ValidationRuleEditor — Scenario 2: Add rule appends default field-match", () => {
  it("fires onChange with one default field-match rule", () => {
    const { spy } = mountWithSpy([]);

    fireEvent.click(screen.getByTestId("validation-rule-editor-add"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      type: "field-match",
      name: "",
      primaryField: "",
      attachmentField: "",
      operator: "equals",
      fieldType: "text",
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: each rule row has a type selector with the three variants
// ---------------------------------------------------------------------------

describe("ValidationRuleEditor — Scenario 3: type selector lists three variants", () => {
  it("opens the type selector and lists field-match, arithmetic, array-match", () => {
    const rules: ValidationRule[] = [
      {
        type: "field-match",
        name: "rule-1",
        primaryField: "a",
        attachmentField: "b",
        operator: "equals",
        fieldType: "text",
      },
    ];
    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    fireEvent.click(screen.getByTestId("validation-rule-editor-type-0"));

    expect(screen.getByText("field-match")).toBeInTheDocument();
    expect(screen.getByText("arithmetic")).toBeInTheDocument();
    expect(screen.getByText("array-match")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: switching variant preserves name, resets everything else
// ---------------------------------------------------------------------------

describe("ValidationRuleEditor — Scenario 4: variant switch preserves name only", () => {
  it("switching field-match → arithmetic replaces the rule with the arithmetic default, preserving name", () => {
    const rules: ValidationRule[] = [
      {
        type: "field-match",
        name: "MyRule",
        primaryField: "a",
        attachmentField: "b",
        operator: "approximately",
        tolerance: { amount: 1 },
        fieldType: "currency",
      },
    ];

    const { spy } = mountWithSpy(rules);

    // Open the type selector for row 0 and switch to "arithmetic".
    fireEvent.click(screen.getByTestId("validation-rule-editor-type-0"));
    fireEvent.click(screen.getByText("arithmetic"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      type: "arithmetic",
      name: "MyRule",
      expression: { operation: "sum", fields: [""], equals: "" },
      operator: "equals",
      fieldType: "text",
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Remove shrinks the array
// ---------------------------------------------------------------------------

describe("ValidationRuleEditor — Scenario 5: removing a rule shrinks the array", () => {
  it("clicking remove on row 0 fires onChange with just the second rule", () => {
    const rules: ValidationRule[] = [
      {
        type: "field-match",
        name: "first",
        primaryField: "a",
        attachmentField: "b",
        operator: "equals",
        fieldType: "text",
      },
      {
        type: "arithmetic",
        name: "second",
        expression: {
          operation: "sum",
          fields: ["x", "y"],
          equals: "z",
        },
        operator: "equals",
        fieldType: "number",
      },
    ];

    const { spy } = mountWithSpy(rules);

    fireEvent.click(screen.getByTestId("validation-rule-editor-remove-0"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual(rules[1]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: each row mounts the correct variant body via test-id dispatch
// ---------------------------------------------------------------------------

describe("ValidationRuleEditor — Scenario 6: rows dispatch to the correct variant body", () => {
  it("row 0 (field-match) mounts the field-match body, row 1 (arithmetic) mounts the arithmetic body", () => {
    const rules: ValidationRule[] = [
      {
        type: "field-match",
        name: "first",
        primaryField: "a",
        attachmentField: "b",
        operator: "equals",
        fieldType: "text",
      },
      {
        type: "arithmetic",
        name: "second",
        expression: { operation: "sum", fields: [""], equals: "" },
        operator: "equals",
        fieldType: "text",
      },
    ];

    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const row0 = screen.getByTestId("validation-rule-editor-row-0");
    const row1 = screen.getByTestId("validation-rule-editor-row-1");

    expect(within(row0).getByTestId("field-match-body")).toBeInTheDocument();
    expect(within(row1).getByTestId("arithmetic-body")).toBeInTheDocument();

    // Cross-check: the wrong body shouldn't mount in either row.
    expect(
      within(row0).queryByTestId("arithmetic-body"),
    ).not.toBeInTheDocument();
    expect(
      within(row1).queryByTestId("field-match-body"),
    ).not.toBeInTheDocument();
  });

  it("a row whose type is array-match mounts the array-match body", () => {
    const rules: ValidationRule[] = [
      {
        type: "array-match",
        name: "third",
        primaryFields: ["p1"],
        attachmentFields: ["a1"],
        matchType: "any",
        operator: "equals",
        fieldType: "text",
      },
    ];

    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const row0 = screen.getByTestId("validation-rule-editor-row-0");
    expect(within(row0).getByTestId("array-match-body")).toBeInTheDocument();
  });
});

// ===========================================================================
// US-028: field-match + array-match variant bodies
// ===========================================================================

// ---------------------------------------------------------------------------
// US-028 Scenario 1: FieldMatchRuleBody renders all six variant fields
// ---------------------------------------------------------------------------

describe("FieldMatchRuleBody — US-028 Scenario 1: renders all six variant fields", () => {
  it("exposes name, primaryField, attachmentField, operator (with 2 options), tolerance.amount + tolerance.percentage, and fieldType (with 3 options)", () => {
    const rules: ValidationRule[] = [
      {
        type: "field-match",
        name: "subtotal",
        primaryField: "primary.subtotal",
        attachmentField: "attachment.subtotal",
        operator: "equals",
        fieldType: "text",
      },
    ];

    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const body = screen.getByTestId("field-match-body");

    // Scalar text inputs
    expect(within(body).getByTestId("field-match-name-0")).toBeInTheDocument();
    expect(
      within(body).getByTestId("field-match-primary-field-0"),
    ).toBeInTheDocument();
    expect(
      within(body).getByTestId("field-match-attachment-field-0"),
    ).toBeInTheDocument();

    // Operator select — has the two enum options when opened
    const operator = within(body).getByTestId("field-match-operator-0");
    fireEvent.click(operator);
    expect(screen.getByText("equals")).toBeInTheDocument();
    expect(screen.getByText("approximately")).toBeInTheDocument();

    // Tolerance number inputs (both optional)
    expect(
      within(body).getByTestId("field-match-tolerance-amount-0"),
    ).toBeInTheDocument();
    expect(
      within(body).getByTestId("field-match-tolerance-percentage-0"),
    ).toBeInTheDocument();

    // Field-type select — has the three enum options when opened
    const fieldType = within(body).getByTestId("field-match-field-type-0");
    fireEvent.click(fieldType);
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.getByText("currency")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-028 Scenario 2: name edit propagates via onChange
// ---------------------------------------------------------------------------

describe("FieldMatchRuleBody — US-028 Scenario 2: name edit propagates", () => {
  it("typing into name fires onChange with the rule's name updated, all other fields preserved", () => {
    const initial: ValidationRule[] = [
      {
        type: "field-match",
        name: "",
        primaryField: "primary.subtotal",
        attachmentField: "attachment.subtotal",
        operator: "approximately",
        tolerance: { amount: 1 },
        fieldType: "currency",
      },
    ];

    const { spy } = mountWithSpy(initial);

    const nameInput = screen.getByTestId(
      "field-match-name-0",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Subtotal match" } });

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      type: "field-match",
      name: "Subtotal match",
      primaryField: "primary.subtotal",
      attachmentField: "attachment.subtotal",
      operator: "approximately",
      tolerance: { amount: 1 },
      fieldType: "currency",
    });
  });
});

// ---------------------------------------------------------------------------
// US-028 Scenario 3: tolerance defaults undefined and is stripped when blank
// ---------------------------------------------------------------------------

describe("FieldMatchRuleBody — US-028 Scenario 3: tolerance stripped when blank", () => {
  it("setting tolerance.amount to 5 then clearing it drops tolerance entirely (not {})", () => {
    const initial: ValidationRule[] = [
      {
        type: "field-match",
        name: "rule",
        primaryField: "a",
        attachmentField: "b",
        operator: "equals",
        fieldType: "text",
      },
    ];

    const { spy } = mountWithSpy(initial);

    const amountInput = screen.getByTestId(
      "field-match-tolerance-amount-0",
    ) as HTMLInputElement;

    // Type "5"
    fireEvent.change(amountInput, { target: { value: "5" } });

    expect(spy).toHaveBeenCalled();
    const afterSet = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(afterSet).toHaveLength(1);
    expect(afterSet[0]).toEqual({
      type: "field-match",
      name: "rule",
      primaryField: "a",
      attachmentField: "b",
      operator: "equals",
      tolerance: { amount: 5 },
      fieldType: "text",
    });

    // Clear the amount
    fireEvent.change(amountInput, { target: { value: "" } });

    const afterClear = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(afterClear).toHaveLength(1);
    const cleared = afterClear[0];
    expect(cleared.type).toBe("field-match");
    if (cleared.type !== "field-match") throw new Error("variant changed");
    expect(cleared.tolerance).toBeUndefined();
    expect("tolerance" in cleared).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// US-028 Scenario 4: ArrayMatchRuleBody renders the array variant correctly
// ---------------------------------------------------------------------------

describe("ArrayMatchRuleBody — US-028 Scenario 4: renders the array variant correctly", () => {
  it("exposes list editors for primaryFields and attachmentFields, plus the scalar inputs/selects", () => {
    const rules: ValidationRule[] = [
      {
        type: "array-match",
        name: "list-rule",
        primaryFields: ["a"],
        attachmentFields: ["b"],
        matchType: "any",
        operator: "equals",
        fieldType: "text",
      },
    ];

    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const body = screen.getByTestId("array-match-body");

    // Array list editors — at least one row of each plus add buttons
    expect(
      within(body).getByTestId("array-match-primary-fields-item-0-0"),
    ).toBeInTheDocument();
    expect(
      within(body).getByTestId("array-match-primary-fields-add-0"),
    ).toBeInTheDocument();
    expect(
      within(body).getByTestId("array-match-attachment-fields-item-0-0"),
    ).toBeInTheDocument();
    expect(
      within(body).getByTestId("array-match-attachment-fields-add-0"),
    ).toBeInTheDocument();

    // Scalar inputs
    expect(within(body).getByTestId("array-match-name-0")).toBeInTheDocument();

    // matchType select with any/all
    const matchType = within(body).getByTestId("array-match-match-type-0");
    fireEvent.click(matchType);
    expect(screen.getByText("any")).toBeInTheDocument();
    expect(screen.getByText("all")).toBeInTheDocument();

    // operator with equals/approximately
    const operator = within(body).getByTestId("array-match-operator-0");
    fireEvent.click(operator);
    expect(screen.getByText("equals")).toBeInTheDocument();
    expect(screen.getByText("approximately")).toBeInTheDocument();

    // tolerance amount + percentage NumberInputs (optional)
    expect(
      within(body).getByTestId("array-match-tolerance-amount-0"),
    ).toBeInTheDocument();
    expect(
      within(body).getByTestId("array-match-tolerance-percentage-0"),
    ).toBeInTheDocument();

    // fieldType with text/number/currency
    const fieldType = within(body).getByTestId("array-match-field-type-0");
    fireEvent.click(fieldType);
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.getByText("currency")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-028 Scenario 5: add + remove items in primaryFields propagates correctly
// ---------------------------------------------------------------------------

describe("ArrayMatchRuleBody — US-028 Scenario 5: add/remove primaryFields items", () => {
  it("clicking Add then typing into row 1 fires onChange with primaryFields growing; trash on row 0 removes the first row", () => {
    const initial: ValidationRule[] = [
      {
        type: "array-match",
        name: "list-rule",
        primaryFields: ["x"],
        attachmentFields: ["b"],
        matchType: "any",
        operator: "equals",
        fieldType: "text",
      },
    ];

    const { spy } = mountWithSpy(initial);

    // Click Add under primaryFields
    fireEvent.click(screen.getByTestId("array-match-primary-fields-add-0"));

    // Type "y" into the newly-added (index 1) row
    const newRow = screen.getByTestId(
      "array-match-primary-fields-item-1-0",
    ) as HTMLInputElement;
    fireEvent.change(newRow, { target: { value: "y" } });

    const afterAdd = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(afterAdd[0].type).toBe("array-match");
    if (afterAdd[0].type !== "array-match") throw new Error("variant changed");
    expect(afterAdd[0].primaryFields).toEqual(["x", "y"]);

    // Now click trash on the first row (index 0)
    fireEvent.click(
      screen.getByTestId("array-match-primary-fields-remove-0-0"),
    );

    const afterRemove = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(afterRemove[0].type).toBe("array-match");
    if (afterRemove[0].type !== "array-match")
      throw new Error("variant changed");
    expect(afterRemove[0].primaryFields).toEqual(["y"]);
  });
});

// ---------------------------------------------------------------------------
// US-028 Scenario 6: required-field surfacing via Mantine `withAsterisk`
// ---------------------------------------------------------------------------

describe("FieldMatchRuleBody — US-028 Scenario 6: required fields show asterisks", () => {
  it("name, primaryField, attachmentField, operator, and fieldType render with `withAsterisk`; tolerance inputs do NOT", () => {
    const rules: ValidationRule[] = [
      {
        type: "field-match",
        name: "",
        primaryField: "",
        attachmentField: "",
        operator: "equals",
        fieldType: "text",
      },
    ];

    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const body = screen.getByTestId("field-match-body");

    const requiredTestIds = [
      "field-match-name-0",
      "field-match-primary-field-0",
      "field-match-attachment-field-0",
      "field-match-operator-0",
      "field-match-field-type-0",
    ];

    for (const testId of requiredTestIds) {
      const control = within(body).getByTestId(testId);
      // Mantine: the wrapper carries the InputWrapper; the InputLabel renders
      // a `*` span when `withAsterisk` is true. Walk up to the wrapper and
      // assert its label contains the asterisk.
      const wrapper = control.closest(".mantine-InputWrapper-root");
      expect(wrapper).not.toBeNull();
      expect(wrapper?.textContent ?? "").toContain("*");
    }

    // Tolerance inputs must NOT carry an asterisk.
    const optionalTestIds = [
      "field-match-tolerance-amount-0",
      "field-match-tolerance-percentage-0",
    ];

    for (const testId of optionalTestIds) {
      const control = within(body).getByTestId(testId);
      const wrapper = control.closest(".mantine-InputWrapper-root");
      expect(wrapper).not.toBeNull();
      const label = wrapper?.querySelector(".mantine-InputWrapper-label");
      // Either no label at all, or a label without the asterisk span.
      if (label) {
        expect(label.querySelector("[aria-hidden='true']")).toBeNull();
      }
    }
  });
});

// ===========================================================================
// US-029: arithmetic variant body with nested expression
// ===========================================================================

// ---------------------------------------------------------------------------
// US-029 Scenario 1: ArithmeticRuleBody renders all variant fields + nested
// expression sub-form.
// ---------------------------------------------------------------------------

describe("ArithmeticRuleBody — US-029 Scenario 1: renders top-level fields + nested expression sub-form", () => {
  it("exposes name, operator, tolerance.amount, tolerance.percentage, fieldType, plus expression.operation (Select with 3 options), expression.fields[] list editor, expression.equals TextInput", () => {
    const rules: ValidationRule[] = [
      {
        type: "arithmetic",
        name: "subtotal-check",
        expression: {
          operation: "sum",
          fields: ["a", "b"],
          equals: "total",
        },
        operator: "equals",
        fieldType: "text",
      },
    ];

    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const body = screen.getByTestId("arithmetic-body");

    // Top-level scalars
    expect(within(body).getByTestId("arithmetic-name-0")).toBeInTheDocument();

    // Operator select with the two enum options
    const operator = within(body).getByTestId("arithmetic-operator-0");
    fireEvent.click(operator);
    expect(screen.getByText("equals")).toBeInTheDocument();
    expect(screen.getByText("approximately")).toBeInTheDocument();

    // Tolerance inputs (both optional)
    expect(
      within(body).getByTestId("arithmetic-tolerance-amount-0"),
    ).toBeInTheDocument();
    expect(
      within(body).getByTestId("arithmetic-tolerance-percentage-0"),
    ).toBeInTheDocument();

    // FieldType select with three enum options
    const fieldType = within(body).getByTestId("arithmetic-field-type-0");
    fireEvent.click(fieldType);
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.getByText("currency")).toBeInTheDocument();

    // Nested expression sub-form is rendered
    const expression = within(body).getByTestId("arithmetic-expression-0");
    expect(expression).toBeInTheDocument();

    // operation Select with sum / difference / product options
    const operation = within(expression).getByTestId(
      "arithmetic-expression-operation-0",
    );
    fireEvent.click(operation);
    expect(screen.getByText("sum")).toBeInTheDocument();
    expect(screen.getByText("difference")).toBeInTheDocument();
    expect(screen.getByText("product")).toBeInTheDocument();

    // fields[] list editor — at least one row and an add button
    expect(
      within(expression).getByTestId("arithmetic-expression-fields-item-0-0"),
    ).toBeInTheDocument();
    expect(
      within(expression).getByTestId("arithmetic-expression-fields-item-1-0"),
    ).toBeInTheDocument();
    expect(
      within(expression).getByTestId("arithmetic-expression-fields-add-0"),
    ).toBeInTheDocument();

    // equals TextInput
    expect(
      within(expression).getByTestId("arithmetic-expression-equals-0"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-029 Scenario 2: editing expression.operation propagates correctly
// ---------------------------------------------------------------------------

describe("ArithmeticRuleBody — US-029 Scenario 2: editing expression.operation propagates", () => {
  it("changing operation from sum to difference fires onChange with expression.operation updated, all other fields preserved", () => {
    const initial: ValidationRule[] = [
      {
        type: "arithmetic",
        name: "subtotal-check",
        expression: {
          operation: "sum",
          fields: ["a", "b"],
          equals: "total",
        },
        operator: "equals",
        fieldType: "text",
      },
    ];

    const { spy } = mountWithSpy(initial);

    fireEvent.click(screen.getByTestId("arithmetic-expression-operation-0"));
    fireEvent.click(screen.getByText("difference"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      type: "arithmetic",
      name: "subtotal-check",
      expression: {
        operation: "difference",
        fields: ["a", "b"],
        equals: "total",
      },
      operator: "equals",
      fieldType: "text",
    });
  });
});

// ---------------------------------------------------------------------------
// US-029 Scenario 3: add / remove expression.fields rows
// ---------------------------------------------------------------------------

describe("ArithmeticRuleBody — US-029 Scenario 3: add/remove expression.fields rows", () => {
  it("clicking Add then typing into row 2 gives ['a','b','c']; trash on row 1 gives ['a','c']; last remaining row's trash is disabled", () => {
    const initial: ValidationRule[] = [
      {
        type: "arithmetic",
        name: "subtotal-check",
        expression: {
          operation: "sum",
          fields: ["a", "b"],
          equals: "total",
        },
        operator: "equals",
        fieldType: "text",
      },
    ];

    const { spy } = mountWithSpy(initial);

    // Click Add under expression.fields
    fireEvent.click(screen.getByTestId("arithmetic-expression-fields-add-0"));

    // Type "c" into the newly-added (index 2) row
    const newRow = screen.getByTestId(
      "arithmetic-expression-fields-item-2-0",
    ) as HTMLInputElement;
    fireEvent.change(newRow, { target: { value: "c" } });

    const afterAdd = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(afterAdd[0].type).toBe("arithmetic");
    if (afterAdd[0].type !== "arithmetic") throw new Error("variant changed");
    expect(afterAdd[0].expression.fields).toEqual(["a", "b", "c"]);

    // Now click trash on the second row (index 1) — removes "b"
    fireEvent.click(
      screen.getByTestId("arithmetic-expression-fields-remove-1-0"),
    );

    const afterRemove = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(afterRemove[0].type).toBe("arithmetic");
    if (afterRemove[0].type !== "arithmetic")
      throw new Error("variant changed");
    expect(afterRemove[0].expression.fields).toEqual(["a", "c"]);

    // Remove again — now ["a"]
    fireEvent.click(
      screen.getByTestId("arithmetic-expression-fields-remove-1-0"),
    );

    const afterSecondRemove = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(afterSecondRemove[0].type).toBe("arithmetic");
    if (afterSecondRemove[0].type !== "arithmetic")
      throw new Error("variant changed");
    expect(afterSecondRemove[0].expression.fields).toEqual(["a"]);

    // Now there's only one row; its trash icon should be disabled.
    const lastRowTrash = screen.getByTestId(
      "arithmetic-expression-fields-remove-0-0",
    );
    expect(lastRowTrash).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// US-029 Scenario 4: editing expression.equals propagates
// ---------------------------------------------------------------------------

describe("ArithmeticRuleBody — US-029 Scenario 4: editing expression.equals propagates", () => {
  it("typing into the equals input fires onChange with expression.equals updated, other fields preserved", () => {
    const initial: ValidationRule[] = [
      {
        type: "arithmetic",
        name: "subtotal-check",
        expression: {
          operation: "sum",
          fields: ["a", "b"],
          equals: "total",
        },
        operator: "equals",
        fieldType: "text",
      },
    ];

    const { spy } = mountWithSpy(initial);

    const equalsInput = screen.getByTestId(
      "arithmetic-expression-equals-0",
    ) as HTMLInputElement;
    fireEvent.change(equalsInput, { target: { value: "netTotal" } });

    const next = spy.mock.lastCall?.[0] as ValidationRule[];
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({
      type: "arithmetic",
      name: "subtotal-check",
      expression: {
        operation: "sum",
        fields: ["a", "b"],
        equals: "netTotal",
      },
      operator: "equals",
      fieldType: "text",
    });
  });
});

// ---------------------------------------------------------------------------
// US-029 Scenario 5: default-shape arithmetic rule from the variant-switch
// ---------------------------------------------------------------------------

describe("ArithmeticRuleBody — US-029 Scenario 5: default-shape arithmetic rule renders", () => {
  it("renders the schema-defaults arithmetic rule (operation=sum, fields=[''], equals='', operator='equals', fieldType='text') without error", () => {
    const rules: ValidationRule[] = [
      {
        type: "arithmetic",
        name: "MyRule",
        expression: { operation: "sum", fields: [""], equals: "" },
        operator: "equals",
        fieldType: "text",
      },
    ];

    renderEditor(
      <ValidationRuleEditor value={rules} onChange={() => undefined} />,
    );

    const body = screen.getByTestId("arithmetic-body");
    expect(body).toBeInTheDocument();

    // Top-level inputs mounted
    const nameInput = within(body).getByTestId(
      "arithmetic-name-0",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("MyRule");

    // Nested expression sub-form mounted with default shape
    const expression = within(body).getByTestId("arithmetic-expression-0");
    expect(expression).toBeInTheDocument();

    // Exactly one fields row (the default empty one) and its trash disabled
    expect(
      within(expression).getByTestId("arithmetic-expression-fields-item-0-0"),
    ).toBeInTheDocument();
    const lastRowTrash = within(expression).getByTestId(
      "arithmetic-expression-fields-remove-0-0",
    );
    expect(lastRowTrash).toBeDisabled();

    // equals input rendered, default empty
    const equalsInput = within(expression).getByTestId(
      "arithmetic-expression-equals-0",
    ) as HTMLInputElement;
    expect(equalsInput.value).toBe("");
  });
});
