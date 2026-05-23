/**
 * Tests for JsonSchemaForm (US-030).
 *
 * Each test corresponds to one acceptance scenario from
 * feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/user_stories/US-030-json-schema-form-routes-validation-rule-editor.md.
 *
 * Scope of US-030: routing — when a JSON Schema property is an array
 * carrying `x-widget: "validation-rule-editor"`, the form should mount the
 * bespoke ValidationRuleEditor component instead of the generic array
 * fallback. Without that hint, the existing array renderer is used.
 */

import "@testing-library/jest-dom";

import {
  getActivityParametersJsonSchema,
  type ValidationRule,
} from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { JsonSchemaForm } from "./JsonSchemaForm";
import type { JsonSchemaProperty } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Controlled wrapper around JsonSchemaForm — drives the form with React
 * state and records the latest top-level onChange payload.
 */
function mountWithSpy(
  schema: JsonSchemaProperty,
  initial: Record<string, unknown>,
) {
  const spy = vi.fn<(next: Record<string, unknown>) => void>();

  function Wrapper() {
    const [value, setValue] = useState<Record<string, unknown>>(initial);
    return (
      <JsonSchemaForm
        schema={schema}
        value={value}
        onChange={(next) => {
          spy(next);
          setValue(next);
        }}
      />
    );
  }

  const utils = renderForm(<Wrapper />);
  return { ...utils, spy };
}

// ---------------------------------------------------------------------------
// Scenario 1: x-widget hint routes to ValidationRuleEditor
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — Scenario 1: x-widget hint routes to ValidationRuleEditor", () => {
  it("renders ValidationRuleEditor for an array with x-widget: validation-rule-editor", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        rules: {
          type: "array",
          "x-widget": "validation-rule-editor",
          items: {
            // Minimal discriminated-union-like items shape — the routing
            // doesn't actually inspect it; the bespoke editor uses the Zod
            // schema directly. We provide it to satisfy `fieldSchema.items`
            // existence in any future branches.
            anyOf: [
              {
                type: "object",
                properties: {
                  type: { type: "string", const: "field-match" },
                },
              },
            ],
          },
        },
      },
      required: ["rules"],
    };

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ rules: [] }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("validation-rule-editor")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: editing inside the routed editor propagates through onChange
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — Scenario 2: editor edits propagate through JsonSchemaForm.onChange", () => {
  it("clicking Add rule fires the parent onChange with { rules: [<default rule>] }", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        rules: {
          type: "array",
          "x-widget": "validation-rule-editor",
          items: { type: "object", properties: {} },
        },
      },
      required: ["rules"],
    };

    const { spy } = mountWithSpy(schema, { rules: [] });

    fireEvent.click(screen.getByTestId("validation-rule-editor-add"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({
      rules: [
        {
          type: "field-match",
          name: "",
          primaryField: "",
          attachmentField: "",
          operator: "equals",
          fieldType: "text",
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: catalog schema + template rules → 4 rule rows render
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — Scenario 3: catalog schema + multi-page-report template renders 4 rule rows", () => {
  it("renders 4 rule rows when given the catalog schema + the template's parameters", () => {
    const schema = getActivityParametersJsonSchema(
      "document.validateFields",
    ) as JsonSchemaProperty;

    // Rules copied verbatim from
    // docs-md/graph-workflows/templates/multi-page-report-workflow.json →
    // nodes.validateFields.parameters.rules.
    const rules: ValidationRule[] = [
      {
        name: "pay-stub-arithmetic",
        type: "arithmetic",
        expression: {
          operation: "difference",
          fields: ["page2.grossPay", "page2.totalDeductions"],
          equals: "page2.netPay",
        },
        operator: "approximately",
        tolerance: { amount: 0.05 },
        fieldType: "currency",
      },
      {
        name: "gross-pay-match",
        type: "field-match",
        primaryField: "page1.grossPay",
        attachmentField: "page2.grossPay",
        operator: "approximately",
        tolerance: { amount: 0.05 },
        fieldType: "currency",
      },
      {
        name: "net-pay-match",
        type: "field-match",
        primaryField: "page1.netPay",
        attachmentField: "page2.netPay",
        operator: "approximately",
        tolerance: { amount: 0.05 },
        fieldType: "currency",
      },
      {
        name: "deposits-match",
        type: "array-match",
        primaryFields: ["page1.netPay", "page1.totalOtherIncome"],
        attachmentFields: ["page3.amount"],
        matchType: "all",
        operator: "approximately",
        tolerance: { amount: 0.05 },
        fieldType: "currency",
      },
    ];

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ rules }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("validation-rule-editor")).toBeInTheDocument();
    expect(
      screen.getByTestId("validation-rule-editor-row-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("validation-rule-editor-row-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("validation-rule-editor-row-2"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("validation-rule-editor-row-3"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("validation-rule-editor-row-4"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: array without widget hint falls back to generic array renderer
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — Scenario 4: array without x-widget falls back to generic renderer", () => {
  it("does not mount ValidationRuleEditor for a plain array schema", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        tags: {
          type: "array",
          title: "Tags",
          items: { type: "string" },
        },
      },
    };

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ tags: ["alpha", "beta"] }}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.queryByTestId("validation-rule-editor"),
    ).not.toBeInTheDocument();
    // Generic array renderer shows the "Add <singular>" button label.
    expect(
      screen.getByRole("button", { name: /Add Tag/i }),
    ).toBeInTheDocument();
  });
});
