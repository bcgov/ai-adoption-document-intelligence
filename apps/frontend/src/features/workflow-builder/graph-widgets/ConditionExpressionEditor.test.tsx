/**
 * Tests for ConditionExpressionEditor (US-003).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260522-workflow-builder-control-flow-nodes/user_stories/US-003-condition-expression-editor.md.
 */

import "@testing-library/jest-dom";

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityNode,
  ComparisonExpression,
  ConditionExpression,
  CtxDeclaration,
  GraphNode,
  GraphWorkflowConfig,
  ListMembershipExpression,
  LogicalExpression,
  NotExpression,
  NullCheckExpression,
} from "../../../types/workflow";
import { ConditionExpressionEditor } from "./ConditionExpressionEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  nodes: GraphNode[] = [],
  ctx: Record<string, CtxDeclaration> = {},
): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) {
    nodesRecord[node.id] = node;
  }
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges: [],
    ctx,
  };
}

const activity = (
  id: string,
  label: string,
  outputs: { port: string; ctxKey: string }[] = [],
): ActivityNode => ({
  id,
  type: "activity",
  label,
  activityType: "test.noop",
  outputs,
});

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Read a Mantine Select's currently-displayed *label* from the DOM. Note
 * Mantine renders the option *label* in the visible input, not the
 * option `value`. The component sets human-readable labels for kinds
 * ("Logical AND", "NOT", etc.) and the raw operator strings for
 * comparison/null-check/membership operator dropdowns.
 */
function selectValue(testId: string): string {
  const el = screen.getByTestId(testId) as HTMLInputElement;
  return el.value ?? "";
}

const KIND_LABEL: Record<string, string> = {
  comparison: "Comparison",
  and: "Logical AND",
  or: "Logical OR",
  not: "NOT",
  "null-check": "Null check",
  membership: "Membership",
};

// ---------------------------------------------------------------------------
// Scenario 1: Renders all five expression kinds with their proper bodies
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — Scenario 1: renders each kind's body", () => {
  it("renders a ComparisonExpression with op + left + right ValueRef fields", () => {
    const expr: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.a" },
      right: { literal: 5 },
    };
    renderEditor(
      <ConditionExpressionEditor
        value={expr}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );

    expect(selectValue("condition-expression-editor-kind")).toBe(
      KIND_LABEL.comparison,
    );
    expect(
      screen.getByTestId("condition-expression-editor-body-comparison"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-left"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-right"),
    ).toBeInTheDocument();
    // Operator dropdown reflects the value.
    expect(selectValue("condition-expression-editor-comparison-op")).toBe(
      "equals",
    );
  });

  it("renders a LogicalExpression (and) with N operand rows", () => {
    const expr: LogicalExpression = {
      operator: "and",
      operands: [
        { operator: "equals", left: { ref: "ctx.a" }, right: { literal: 1 } },
        { operator: "equals", left: { ref: "ctx.b" }, right: { literal: 2 } },
      ],
    };
    renderEditor(
      <ConditionExpressionEditor
        value={expr}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );

    expect(selectValue("condition-expression-editor-kind")).toBe(
      KIND_LABEL.and,
    );
    expect(
      screen.getByTestId("condition-expression-editor-body-logical"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-operand-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-operand-1"),
    ).toBeInTheDocument();
  });

  it("renders a NotExpression with a single recursive operand editor", () => {
    const expr: NotExpression = {
      operator: "not",
      operand: {
        operator: "equals",
        left: { ref: "ctx.a" },
        right: { literal: 1 },
      },
    };
    renderEditor(
      <ConditionExpressionEditor
        value={expr}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );

    expect(selectValue("condition-expression-editor-kind")).toBe(
      KIND_LABEL.not,
    );
    expect(
      screen.getByTestId("condition-expression-editor-body-not"),
    ).toBeInTheDocument();
    // The inner operand renders its own nested editor.
    expect(
      screen.getByTestId("condition-expression-editor-not-operand-editor"),
    ).toBeInTheDocument();
  });

  it("renders a NullCheckExpression with op + single ValueRef", () => {
    const expr: NullCheckExpression = {
      operator: "is-null",
      value: { ref: "ctx.a" },
    };
    renderEditor(
      <ConditionExpressionEditor
        value={expr}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );

    expect(selectValue("condition-expression-editor-kind")).toBe(
      KIND_LABEL["null-check"],
    );
    expect(
      screen.getByTestId("condition-expression-editor-body-null-check"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-value"),
    ).toBeInTheDocument();
    expect(selectValue("condition-expression-editor-null-check-op")).toBe(
      "is-null",
    );
  });

  it("renders a ListMembershipExpression with op + value + list ValueRefs", () => {
    const expr: ListMembershipExpression = {
      operator: "in",
      value: { ref: "ctx.a" },
      list: { literal: [1, 2, 3] },
    };
    renderEditor(
      <ConditionExpressionEditor
        value={expr}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );

    expect(selectValue("condition-expression-editor-kind")).toBe(
      KIND_LABEL.membership,
    );
    expect(
      screen.getByTestId("condition-expression-editor-body-membership"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-value"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-list"),
    ).toBeInTheDocument();
    expect(selectValue("condition-expression-editor-membership-op")).toBe("in");
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: ValueRef editor supports a Ref / Literal toggle that
// persists exactly one
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — Scenario 2: ValueRef Ref/Literal toggle", () => {
  it("toggling to Literal then editing emits { literal } only (no ref); toggling back to Ref emits { ref } only (no literal)", () => {
    const config = makeConfig([], { someKey: { type: "string" } });
    const onChange = vi.fn<(next: ConditionExpression | undefined) => void>();

    function Wrapper() {
      const [value, setValue] = useState<ConditionExpression | undefined>({
        operator: "equals",
        left: { ref: "" },
        right: { ref: "" },
      });
      return (
        <ConditionExpressionEditor
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          config={config}
        />
      );
    }

    renderEditor(<Wrapper />);

    // Toggle the LEFT ValueRef to Literal mode.
    const modeToggle = within(
      screen.getByTestId("condition-expression-editor-left-mode"),
    ).getByText("Literal");
    fireEvent.click(modeToggle);

    // Last call should produce a left with literal-only.
    const lastAfterToggle = onChange.mock.lastCall?.[0] as ComparisonExpression;
    expect(lastAfterToggle.left).toEqual({ literal: "" });
    expect("ref" in lastAfterToggle.left).toBe(false);

    // Now type a literal value.
    const literalInput = screen.getByTestId(
      "condition-expression-editor-left-literal-input",
    ) as HTMLInputElement;
    fireEvent.change(literalInput, { target: { value: "42" } });

    const lastAfterEdit = onChange.mock.lastCall?.[0] as ComparisonExpression;
    expect(lastAfterEdit.left).toEqual({ literal: 42 });
    expect("ref" in lastAfterEdit.left).toBe(false);

    // Toggle back to Ref.
    const refToggle = within(
      screen.getByTestId("condition-expression-editor-left-mode"),
    ).getByText("Ref");
    fireEvent.click(refToggle);

    const lastAfterRef = onChange.mock.lastCall?.[0] as ComparisonExpression;
    expect(lastAfterRef.left).toEqual({ ref: "" });
    expect("literal" in lastAfterRef.left).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Switching operator-type preserves what fits
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — Scenario 3: switching kind preserves payload", () => {
  it("switching from comparison to NOT wraps the comparison as the NOT's operand", () => {
    const initial: ComparisonExpression = {
      operator: "equals",
      left: { ref: "ctx.a" },
      right: { literal: 5 },
    };
    const onChange = vi.fn<(next: ConditionExpression | undefined) => void>();

    renderEditor(
      <ConditionExpressionEditor
        value={initial}
        onChange={onChange}
        config={makeConfig()}
      />,
    );

    // Change the kind selector to NOT.
    const kindSelect = screen.getByTestId(
      "condition-expression-editor-kind",
    ) as HTMLInputElement;
    fireEvent.change(kindSelect, { target: { value: "NOT" } });
    // Mantine Select with `data` of {value,label} — onChange takes the value.
    // Use click-to-open + click option for a real Mantine click path.
    fireEvent.click(kindSelect);
    const notOption = screen.getByText("NOT");
    fireEvent.click(notOption);

    const last = onChange.mock.lastCall?.[0] as NotExpression;
    expect(last.operator).toBe("not");
    expect(last.operand).toEqual(initial);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Logical AND/OR supports add/remove operands with visual indent
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — Scenario 4: add/remove operands + indent", () => {
  it("Add Operand grows to 3; Remove on index 1 returns to 2; nested rows are indented", () => {
    const onChange = vi.fn<(next: ConditionExpression | undefined) => void>();

    function Wrapper() {
      const [value, setValue] = useState<ConditionExpression | undefined>({
        operator: "and",
        operands: [
          {
            operator: "equals",
            left: { ref: "ctx.a" },
            right: { literal: 1 },
          },
          {
            operator: "equals",
            left: { ref: "ctx.b" },
            right: { literal: 2 },
          },
        ],
      });
      return (
        <ConditionExpressionEditor
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          config={makeConfig()}
        />
      );
    }

    renderEditor(<Wrapper />);

    // Click "Add operand" → onChange fires with 3 operands.
    fireEvent.click(
      screen.getByTestId("condition-expression-editor-add-operand"),
    );
    const addCall = onChange.mock.calls[
      onChange.mock.calls.length - 1
    ]?.[0] as LogicalExpression;
    expect(addCall.operator).toBe("and");
    expect(addCall.operands).toHaveLength(3);

    // Click Remove on operand index 1 → onChange fires with 2 operands.
    fireEvent.click(
      screen.getByTestId("condition-expression-editor-operand-1-remove"),
    );
    const removeCall = onChange.mock.calls[
      onChange.mock.calls.length - 1
    ]?.[0] as LogicalExpression;
    expect(removeCall.operator).toBe("and");
    expect(removeCall.operands).toHaveLength(2);

    // Each operand row's inner editor renders with depth > 0 (a left border
    // via inline style). We assert the `data-depth` attribute is set on the
    // nested editor (set whenever depth > 0).
    const nestedOperandEditor = screen.getByTestId(
      "condition-expression-editor-operand-0-editor",
    );
    expect(nestedOperandEditor.getAttribute("data-depth")).toBe("1");
    expect(nestedOperandEditor.getAttribute("style") ?? "").toMatch(
      /border-left/,
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Round-trips a 3-level deep nested expression
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — Scenario 5: 3-level nested round-trip", () => {
  const NESTED: ConditionExpression = {
    operator: "and",
    operands: [
      {
        operator: "or",
        operands: [
          {
            operator: "equals",
            left: { ref: "ctx.a" },
            right: { literal: 5 },
          },
          {
            operator: "not",
            operand: {
              operator: "is-null",
              value: { ref: "ctx.b" },
            },
          },
        ],
      },
      {
        operator: "contains",
        left: { ref: "ctx.c" },
        right: { literal: "x" },
      },
    ],
  };

  it("renders the nested structure exactly as supplied", () => {
    renderEditor(
      <ConditionExpressionEditor
        value={NESTED}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );

    // Outer AND.
    expect(selectValue("condition-expression-editor-kind")).toBe(
      KIND_LABEL.and,
    );

    // First operand (level 1): OR.
    const op0 = screen.getByTestId(
      "condition-expression-editor-operand-0-editor",
    );
    expect(
      within(op0).getAllByTestId(
        "condition-expression-editor-operand-0-editor-kind",
      )[0],
    ).toBeInTheDocument();
    expect(
      (
        within(op0).getAllByTestId(
          "condition-expression-editor-operand-0-editor-kind",
        )[0] as HTMLInputElement
      ).value,
    ).toBe(KIND_LABEL.or);

    // Second operand (level 1): comparison (contains).
    const op1 = screen.getByTestId(
      "condition-expression-editor-operand-1-editor",
    );
    expect(
      (
        within(op1).getAllByTestId(
          "condition-expression-editor-operand-1-editor-kind",
        )[0] as HTMLInputElement
      ).value,
    ).toBe(KIND_LABEL.comparison);
    expect(
      (
        within(op1).getAllByTestId(
          "condition-expression-editor-operand-1-editor-comparison-op",
        )[0] as HTMLInputElement
      ).value,
    ).toBe("contains");

    // OR's first operand (level 2): equals — depth=2 indent.
    const op00 = within(op0).getByTestId(
      "condition-expression-editor-operand-0-editor-operand-0-editor",
    );
    expect(
      (
        within(op00).getAllByTestId(
          "condition-expression-editor-operand-0-editor-operand-0-editor-kind",
        )[0] as HTMLInputElement
      ).value,
    ).toBe(KIND_LABEL.comparison);

    // OR's second operand (level 2): NOT, wrapping IS-NULL (level 3).
    const op01 = within(op0).getByTestId(
      "condition-expression-editor-operand-0-editor-operand-1-editor",
    );
    expect(
      (
        within(op01).getAllByTestId(
          "condition-expression-editor-operand-0-editor-operand-1-editor-kind",
        )[0] as HTMLInputElement
      ).value,
    ).toBe(KIND_LABEL.not);
    // Inside the NOT, the inner editor is the IS-NULL — level 3.
    const innerOfNot = within(op01).getByTestId(
      "condition-expression-editor-operand-0-editor-operand-1-editor-not-operand-editor",
    );
    expect(
      (
        within(innerOfNot).getAllByTestId(
          "condition-expression-editor-operand-0-editor-operand-1-editor-not-operand-editor-kind",
        )[0] as HTMLInputElement
      ).value,
    ).toBe(KIND_LABEL["null-check"]);
  });

  it("editing an inner field emits the full updated tree", () => {
    const onChange = vi.fn<(next: ConditionExpression | undefined) => void>();

    function Wrapper() {
      const [value, setValue] = useState<ConditionExpression | undefined>(
        NESTED,
      );
      return (
        <ConditionExpressionEditor
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          config={makeConfig()}
        />
      );
    }

    renderEditor(<Wrapper />);

    // Find the contains comparison's RIGHT literal input and edit it.
    const literalInput = screen.getByTestId(
      "condition-expression-editor-operand-1-editor-right-literal-input",
    ) as HTMLInputElement;
    fireEvent.change(literalInput, { target: { value: "y" } });

    const next = onChange.mock.lastCall?.[0] as LogicalExpression;
    expect(next.operator).toBe("and");
    expect(next.operands).toHaveLength(2);
    // Outer shape is preserved.
    expect(next.operands[0]).toEqual(NESTED.operands[0]);
    // Inner contains.right.literal updated.
    const updatedContains = next.operands[1] as ComparisonExpression;
    expect(updatedContains.operator).toBe("contains");
    expect(updatedContains.right).toEqual({ literal: "y" });
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Reuses the existing VariablePicker for Ref mode
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — Scenario 6: VariablePicker reuse for Ref mode", () => {
  it("the Ref autocomplete surfaces the same ctx keys + upstream outputs that the activity-node input-binding picker provides", () => {
    const config = makeConfig(
      [
        activity("upstream", "Upstream", [{ port: "out", ctxKey: "bar" }]),
        activity("downstream", "Downstream", []),
      ],
      { foo: { type: "string" } },
    );

    const initial: ComparisonExpression = {
      operator: "equals",
      left: { ref: "" },
      right: { literal: 5 },
    };

    renderEditor(
      <ConditionExpressionEditor
        value={initial}
        onChange={() => undefined}
        config={config}
        currentNodeId="downstream"
      />,
    );

    // The left ValueRef defaults to Ref mode and renders the VariablePicker.
    const refInput = screen.getByTestId(
      "condition-expression-editor-left-ref-input",
    );
    fireEvent.focus(refInput);
    fireEvent.click(refInput);

    // Both the declared ctx key and the upstream output should be offered.
    // Mantine Autocomplete renders option items into the DOM on open.
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    // Group headings should match VariablePicker's grouping.
    expect(screen.getByText("Workflow context")).toBeInTheDocument();
    expect(screen.getByText("Other nodes' outputs")).toBeInTheDocument();
  });
});
