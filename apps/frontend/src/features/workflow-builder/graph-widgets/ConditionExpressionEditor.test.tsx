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
// §4.13: literal input is typeable — text isn't reformatted mid-typing
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — §4.13 literal input stability", () => {
  function LiteralWrapper({
    onChange,
  }: {
    onChange: (next: ConditionExpression | undefined) => void;
  }) {
    const config = makeConfig([], { someKey: { type: "string" } });
    const [value, setValue] = useState<ConditionExpression | undefined>({
      operator: "equals",
      left: { ref: "" },
      // Start the RIGHT side in Literal mode.
      right: { literal: "" },
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

  it("keeps a quoted string in the input and emits the string (not a number)", () => {
    const onChange = vi.fn<(next: ConditionExpression | undefined) => void>();
    renderEditor(<LiteralWrapper onChange={onChange} />);

    const input = screen.getByTestId(
      "condition-expression-editor-right-literal-input",
    ) as HTMLInputElement;

    // Author the STRING "10" via JSON quotes.
    fireEvent.change(input, { target: { value: '"10"' } });

    // The input keeps exactly what was typed (no reformat that strips quotes).
    expect(input.value).toBe('"10"');
    const last = onChange.mock.lastCall?.[0] as ComparisonExpression;
    expect(last.right).toEqual({ literal: "10" });
  });

  it("does not reformat the visible text while typing an interim value", () => {
    const onChange = vi.fn<(next: ConditionExpression | undefined) => void>();
    renderEditor(<LiteralWrapper onChange={onChange} />);

    const input = screen.getByTestId(
      "condition-expression-editor-right-literal-input",
    ) as HTMLInputElement;

    // Interim text that is valid JSON but should not snap/reformat.
    fireEvent.change(input, { target: { value: "10 " } });
    expect(input.value).toBe("10 ");

    // A plain number still parses to a number.
    fireEvent.change(input, { target: { value: "42" } });
    expect(input.value).toBe("42");
    const last = onChange.mock.lastCall?.[0] as ComparisonExpression;
    expect(last.right).toEqual({ literal: 42 });
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

    // The left ValueRef defaults to the step-picker whenever currentNodeId
    // is present; switch to manual entry to reach the VariablePicker.
    fireEvent.click(
      screen.getByTestId("condition-expression-editor-left-manual-link"),
    );
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

// A(file.prepare: preparedData) → SWITCH(consumer). For step-picker tests.
function stepPickerConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "A",
    nodes: {
      A: {
        id: "A",
        type: "activity",
        activityType: "file.prepare",
        label: "Prepare file",
      },
      SW: { id: "SW", type: "switch", label: "Branch", cases: [] },
    },
    edges: [{ id: "e", source: "A", target: "SW", type: "normal" }],
    ctx: {},
  };
}

describe("ConditionExpressionEditor — conditions from node outputs (§11)", () => {
  function renderEditor(initial: ConditionExpression | undefined) {
    function Harness() {
      const [expr, setExpr] = useState(initial);
      return (
        <MantineProvider>
          <ConditionExpressionEditor
            value={expr}
            onChange={setExpr}
            config={stepPickerConfig()}
            currentNodeId="SW"
          />
        </MantineProvider>
      );
    }
    render(<Harness />);
  }

  it("defaults the Ref field to the step-picker for an empty ref", () => {
    renderEditor({
      operator: "equals",
      left: { ref: "" },
      right: { literal: "x" },
    });
    expect(
      screen.getByText("Prepare file → Prepared file data"),
    ).toBeInTheDocument();
  });

  it("picking a step stores the producer's ctx key", () => {
    renderEditor({
      operator: "equals",
      left: { ref: "" },
      right: { literal: "x" },
    });
    fireEvent.click(screen.getByText("Prepare file → Prepared file data"));
    // The store happened via onChange (the Harness's useState), so the
    // resolved caption is now shown for the picked producer.
    expect(
      screen.getAllByText("Prepare file → Prepared file data").length,
    ).toBeGreaterThan(0);
  });

  it("opens in manual mode for a ref that resolves to no producer", () => {
    renderEditor({
      operator: "equals",
      left: { ref: "handTypedKey" },
      right: { literal: "x" },
    });
    expect(screen.getByDisplayValue("handTypedKey")).toBeInTheDocument();
    expect(
      screen.queryByTestId("condition-producer-picker"),
    ).not.toBeInTheDocument();
  });

  it("advanced link swaps step → manual and back", () => {
    renderEditor({
      operator: "equals",
      left: { ref: "" },
      right: { literal: "x" },
    });
    fireEvent.click(screen.getAllByText("Enter a variable manually")[0]);
    expect(screen.getAllByText("Back to steps").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("Back to steps")[0]);
    expect(
      screen.getAllByTestId("condition-producer-picker").length,
    ).toBeGreaterThan(0);
  });

  it("falls back to manual mode when no currentNodeId", () => {
    function Harness() {
      const [expr, setExpr] = useState<ConditionExpression | undefined>({
        operator: "equals",
        left: { ref: "" },
        right: { literal: "x" },
      });
      return (
        <MantineProvider>
          <ConditionExpressionEditor
            value={expr}
            onChange={setExpr}
            config={stepPickerConfig()}
          />
        </MantineProvider>
      );
    }
    render(<Harness />);
    expect(
      screen.queryByTestId("condition-producer-picker"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Field drill-down in step sub-mode (KIND_FIELD_SCHEMAS_DESIGN.md §5)
// ocr(azureOcr.extract: ocrResult, kind OcrResult) → SW(switch).
// ---------------------------------------------------------------------------

function ocrStepConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "ocr",
    nodes: {
      ocr: {
        id: "ocr",
        type: "activity",
        activityType: "azureOcr.extract",
        label: "Extract OCR",
        outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
      },
      SW: { id: "SW", type: "switch", label: "Branch", cases: [] },
    },
    edges: [{ id: "e", source: "ocr", target: "SW", type: "normal" }],
    ctx: {},
  };
}

describe("ConditionExpressionEditor — field drill-down in step sub-mode", () => {
  function renderWithOcr(initial: ConditionExpression | undefined) {
    function Harness() {
      const [expr, setExpr] = useState(initial);
      return (
        <MantineProvider>
          <ConditionExpressionEditor
            value={expr}
            onChange={setExpr}
            config={ocrStepConfig()}
            currentNodeId="SW"
          />
        </MantineProvider>
      );
    }
    render(<Harness />);
  }

  it("offers a field picker when the selected producer port's kind has fields", () => {
    renderWithOcr({
      operator: "not-equals",
      left: { ref: "ocrResult" },
      right: { literal: "running" },
    });
    const fieldInput = screen.getByTestId(
      "condition-expression-editor-left-field-input",
    );
    expect(fieldInput).toBeInTheDocument();
    fireEvent.focus(fieldInput);
    fireEvent.click(fieldInput);
    expect(screen.getByText("status")).toBeInTheDocument();
  });

  it("selecting a field appends it to the stored ref; clearing restores the bare ref", () => {
    renderWithOcr({
      operator: "not-equals",
      left: { ref: "ocrResult" },
      right: { literal: "running" },
    });
    const fieldInput = screen.getByTestId(
      "condition-expression-editor-left-field-input",
    ) as HTMLInputElement;
    fireEvent.change(fieldInput, { target: { value: "status" } });
    // The resolved caption now shows the drilled fieldPath. Scope to the
    // caption testid — ConditionProducerPicker rows render the bare
    // "node → port" string too.
    const resolvedCaption = screen.getByTestId(
      "condition-expression-editor-left-resolved",
    );
    expect(resolvedCaption).toHaveTextContent(
      "Extract OCR → OCR result · status",
    );
    // Clearing the field restores the bare ref (no fieldPath suffix).
    fireEvent.change(fieldInput, { target: { value: "" } });
    expect(
      screen.getByTestId("condition-expression-editor-left-resolved"),
    ).not.toHaveTextContent("status");
  });

  it("renders step sub-mode (not manual) for a drilled stored ref", () => {
    renderWithOcr({
      operator: "not-equals",
      left: { ref: "ocrResult.status" },
      right: { literal: "running" },
    });
    // Resolved caption with the fieldPath is shown (step mode), and the field
    // input reflects the drilled field.
    expect(
      screen.getByText("Extract OCR → OCR result · status"),
    ).toBeInTheDocument();
    const fieldInput = screen.getByTestId(
      "condition-expression-editor-left-field-input",
    ) as HTMLInputElement;
    expect(fieldInput.value).toBe("status");
  });

  it("shows no field picker for a producer port whose kind has no fields", () => {
    // document.normalizeOrientation's correctedBlobKey is kind DocumentRef —
    // a plain blob-key string, no field schema.
    function Harness() {
      const [expr, setExpr] = useState<ConditionExpression | undefined>({
        operator: "equals",
        left: { ref: "__auto.A.correctedBlobKey" },
        right: { literal: "x" },
      });
      return (
        <MantineProvider>
          <ConditionExpressionEditor
            value={expr}
            onChange={setExpr}
            config={{
              schemaVersion: "1.0",
              metadata: {},
              entryNodeId: "A",
              nodes: {
                A: {
                  id: "A",
                  type: "activity",
                  activityType: "document.normalizeOrientation",
                  label: "Correct Orientation",
                  outputs: [
                    {
                      port: "correctedBlobKey",
                      ctxKey: "__auto.A.correctedBlobKey",
                    },
                  ],
                },
                SW: { id: "SW", type: "switch", label: "Branch", cases: [] },
              },
              edges: [{ id: "e", source: "A", target: "SW", type: "normal" }],
              ctx: {},
            }}
            currentNodeId="SW"
          />
        </MantineProvider>
      );
    }
    render(<Harness />);
    // The producer resolves (step mode caption shows) but no field picker,
    // because DocumentRef carries no field schema.
    expect(
      screen.getByTestId("condition-expression-editor-left-resolved"),
    ).toHaveTextContent("Correct Orientation → Corrected blob key");
    expect(
      screen.queryByTestId("condition-expression-editor-left-field-input"),
    ).not.toBeInTheDocument();
  });

  // NOTE (Task 14, kind taxonomy refinement): the spec for this task asked
  // for a TypedSegment field-picker test mirroring the OcrResult case above.
  // That isn't reachable with real catalog data: every Segment-family
  // OUTPUT port in the catalog is an array kind (document.split →
  // DocumentSegment[], document.splitAndClassify → TypedSegment[],
  // document.selectClassifiedPages → ClassifiedPageSegment[],
  // document.flattenClassifiedDocuments → LabeledSegment[]), and
  // resolveKindFields hard-returns [] for any "X[]" kind — this component
  // does not unwrap arrays. The only scalar Segment-subkind ports in the
  // catalog are document.classify's `segment` input and
  // segment.combineResult's `currentSegment` input; inputs are never
  // producers, and ConditionExpressionEditor's step-mode field picker
  // resolves only through activity/pollUntil catalog OUTPUT ports
  // (condition-producer-binding.ts resolveCtxKeyToProducer has no map-item
  // unwrap). The TypedSegment drill-down payoff IS covered end-to-end by
  // variable-field-options.test.ts's "expands TypedSegment ctx keys with the
  // full inherited field chain" case. This test instead documents that the
  // retag doesn't regress this component: a real Segment-family array
  // producer still correctly shows no field picker.
  it("shows no field picker for a Segment-family array producer (arrays aren't drilled here)", () => {
    function Harness() {
      const [expr, setExpr] = useState<ConditionExpression | undefined>({
        operator: "equals",
        left: { ref: "segments" },
        right: { literal: "x" },
      });
      return (
        <MantineProvider>
          <ConditionExpressionEditor
            value={expr}
            onChange={setExpr}
            config={{
              schemaVersion: "1.0",
              metadata: {},
              entryNodeId: "SC",
              nodes: {
                SC: {
                  id: "SC",
                  type: "activity",
                  activityType: "document.splitAndClassify",
                  label: "Split & Classify",
                  outputs: [{ port: "segments", ctxKey: "segments" }],
                },
                SW: { id: "SW", type: "switch", label: "Branch", cases: [] },
              },
              edges: [{ id: "e", source: "SC", target: "SW", type: "normal" }],
              ctx: {},
            }}
            currentNodeId="SW"
          />
        </MantineProvider>
      );
    }
    render(<Harness />);
    // The producer resolves (step mode caption shows) but no field picker,
    // because TypedSegment[] is an array kind — resolveKindFields returns []
    // for it without unwrapping to the element kind.
    expect(
      screen.getByTestId("condition-expression-editor-left-resolved"),
    ).toHaveTextContent("Split & Classify → Segments with types");
    expect(
      screen.queryByTestId("condition-expression-editor-left-field-input"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Group summaries (humanised, shown under every group at every depth)
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — group summaries", () => {
  it("renders the top-level group's summary as a humanised sentence", () => {
    const expr: LogicalExpression = {
      operator: "and",
      operands: [
        {
          operator: "or",
          operands: [
            {
              operator: "equals",
              left: { ref: "ctx.currentDoc.type" },
              right: { literal: "receipt" },
            },
            {
              operator: "gte",
              left: { ref: "ctx.currentDoc.confidence" },
              right: { literal: 0.8 },
            },
          ],
        },
        {
          operator: "not",
          operand: {
            operator: "is-null",
            value: { ref: "ctx.currentDoc.blobKey" },
          },
        },
      ],
    };
    renderEditor(
      <ConditionExpressionEditor
        value={expr}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );
    expect(
      screen.getByTestId("condition-expression-editor-group-summary"),
    ).toHaveTextContent(
      '(ctx.currentDoc.type is "receipt" or ctx.currentDoc.confidence ≥ 0.8) and not (ctx.currentDoc.blobKey is null)',
    );
  });

  it("shows a summary under every logical group — top-level and nested — consistently", () => {
    const expr: LogicalExpression = {
      operator: "and",
      operands: [
        {
          operator: "or",
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
        },
        { operator: "equals", left: { ref: "ctx.c" }, right: { literal: 3 } },
      ],
    };
    renderEditor(
      <ConditionExpressionEditor
        value={expr}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );
    // Top-level AND group has its summary shown inline (no collapse needed).
    expect(
      screen.getByTestId("condition-expression-editor-group-summary"),
    ).toHaveTextContent("(ctx.a is 1 or ctx.b is 2) and ctx.c is 3");
    // Nested OR group has its own summary shown inline too.
    expect(
      screen.getByTestId(
        "condition-expression-editor-operand-0-editor-group-summary",
      ),
    ).toHaveTextContent("ctx.a is 1 or ctx.b is 2");
  });
});

// ---------------------------------------------------------------------------
// Logical group verbs + collapse
// ---------------------------------------------------------------------------

describe("ConditionExpressionEditor — logical group verbs + collapse", () => {
  const AND_EXPR: LogicalExpression = {
    operator: "and",
    operands: [
      { operator: "equals", left: { ref: "ctx.a" }, right: { literal: 1 } },
      { operator: "equals", left: { ref: "ctx.b" }, right: { literal: 2 } },
    ],
  };

  it("labels an AND group 'ALL of these must be true'", () => {
    renderEditor(
      <ConditionExpressionEditor
        value={AND_EXPR}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );
    expect(
      screen.getByTestId("condition-expression-editor-body-logical"),
    ).toHaveTextContent("ALL of these must be true");
  });

  it("labels an OR group 'ANY of these can be true'", () => {
    renderEditor(
      <ConditionExpressionEditor
        value={{ ...AND_EXPR, operator: "or" }}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );
    expect(
      screen.getByTestId("condition-expression-editor-body-logical"),
    ).toHaveTextContent("ANY of these can be true");
  });

  it("collapses the operand form to a one-line summary and expands again", () => {
    renderEditor(
      <ConditionExpressionEditor
        value={AND_EXPR}
        onChange={() => undefined}
        config={makeConfig()}
      />,
    );
    // Expanded by default: operand rows + Add operand present.
    expect(
      screen.getByTestId("condition-expression-editor-operand-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-add-operand"),
    ).toBeInTheDocument();

    // Collapse → operand rows disappear, summary appears.
    fireEvent.click(
      screen.getByTestId("condition-expression-editor-collapse-toggle"),
    );
    expect(
      screen.queryByTestId("condition-expression-editor-operand-0"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("condition-expression-editor-add-operand"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-group-summary"),
    ).toHaveTextContent("ctx.a is 1 and ctx.b is 2");

    // Expand again → operand rows return (summary stays visible throughout).
    fireEvent.click(
      screen.getByTestId("condition-expression-editor-collapse-toggle"),
    );
    expect(
      screen.getByTestId("condition-expression-editor-operand-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("condition-expression-editor-group-summary"),
    ).toBeInTheDocument();
  });
});
