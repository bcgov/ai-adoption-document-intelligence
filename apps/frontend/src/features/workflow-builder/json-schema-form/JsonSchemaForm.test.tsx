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
  listActivityTypes,
  type ValidationRule,
} from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
    // docs-md/workflows/templates/multi-page-report-workflow.json →
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

// ===========================================================================
// US-032: x-widget: "page-range-list" routes to PageRangeListEditor
// ===========================================================================

// ---------------------------------------------------------------------------
// US-032 Scenario 1: routing — x-widget hint mounts PageRangeListEditor
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-032 Scenario 1: x-widget: page-range-list routes to PageRangeListEditor", () => {
  it("renders PageRangeListEditor for an array with x-widget: page-range-list", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        customRanges: {
          type: "array",
          "x-widget": "page-range-list",
          items: {
            type: "object",
            properties: {
              start: { type: "integer", minimum: 1 },
              end: { type: "integer", minimum: 1 },
            },
            required: ["start", "end"],
          },
        },
      },
      required: ["customRanges"],
    };

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ customRanges: [{ start: 1, end: 4 }] }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("page-range-list-editor")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-032 Scenario 2: Add range inside the routed editor propagates to the
// form's onChange.
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-032 Scenario 2: Add range propagates through onChange", () => {
  it("clicking Add range fires the parent onChange with { customRanges: [<default>] }", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        customRanges: {
          type: "array",
          "x-widget": "page-range-list",
          items: {
            type: "object",
            properties: {
              start: { type: "integer", minimum: 1 },
              end: { type: "integer", minimum: 1 },
            },
            required: ["start", "end"],
          },
        },
      },
      required: ["customRanges"],
    };

    const { spy } = mountWithSpy(schema, { customRanges: [] });

    fireEvent.click(screen.getByTestId("page-range-list-editor-add"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({
      customRanges: [{ start: 1, end: 1 }],
    });
  });
});

// ---------------------------------------------------------------------------
// US-032 Scenario 3: arrays without the page-range-list hint still use the
// generic renderer.
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-032 Scenario 3: no regression for plain array schemas", () => {
  it("does not mount PageRangeListEditor for a plain array schema", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        pages: {
          type: "array",
          title: "Pages",
          items: { type: "integer", minimum: 1 },
        },
      },
    };

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ pages: [1, 2, 3] }}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.queryByTestId("page-range-list-editor"),
    ).not.toBeInTheDocument();
    // Generic array renderer shows the "Add <singular>" button label.
    expect(
      screen.getByRole("button", { name: /Add Page/i }),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// US-034: x-widget: "confusion-map-editor" routes to ConfusionMapEditor
// ===========================================================================

// ---------------------------------------------------------------------------
// US-034 Scenario 1: routing — x-widget hint mounts ConfusionMapEditor
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-034 Scenario 1: x-widget: confusion-map-editor routes to ConfusionMapEditor", () => {
  it("renders ConfusionMapEditor for an object with x-widget: confusion-map-editor", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        customConfusionMap: {
          type: "object",
          "x-widget": "confusion-map-editor",
          additionalProperties: { type: "string" },
        },
      },
    };

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ customConfusionMap: { "0": "O" } }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("confusion-map-editor")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-034 Scenario 2: edits inside the routed editor propagate via the
// form's onChange (with the OBJECT shape, not the array of rows).
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-034 Scenario 2: edits propagate", () => {
  it("adding a row + filling it fires the parent onChange with { customConfusionMap: { ... } }", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        customConfusionMap: {
          type: "object",
          "x-widget": "confusion-map-editor",
          additionalProperties: { type: "string" },
        },
      },
    };

    const { spy } = mountWithSpy(schema, { customConfusionMap: {} });

    fireEvent.click(screen.getByTestId("confusion-map-editor-add"));

    const from0 = screen.getByTestId(
      "confusion-map-editor-from-0",
    ) as HTMLInputElement;
    const to0 = screen.getByTestId(
      "confusion-map-editor-to-0",
    ) as HTMLInputElement;

    fireEvent.change(from0, { target: { value: "1" } });
    fireEvent.blur(from0);
    fireEvent.change(to0, { target: { value: "I" } });
    fireEvent.blur(to0);

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({ customConfusionMap: { "1": "I" } });
  });
});

// ---------------------------------------------------------------------------
// US-034 Scenario 3: other object schemas (without the widget hint) fall
// back to the generic renderer / unsupported stub — no regression.
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-034 Scenario 3: object schemas without the hint fall back", () => {
  it("does not mount ConfusionMapEditor for an object schema without x-widget", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        freeFormBag: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    };

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ freeFormBag: { foo: "bar" } }}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.queryByTestId("confusion-map-editor"),
    ).not.toBeInTheDocument();
  });
});

// ===========================================================================
// US-036: x-widget: "keyword-pattern-editor" routes to KeywordPatternEditor
// ===========================================================================

// ---------------------------------------------------------------------------
// US-036 Scenario 1: routing — x-widget hint mounts KeywordPatternEditor
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-036 Scenario 1: x-widget: keyword-pattern-editor routes to KeywordPatternEditor", () => {
  it("renders KeywordPatternEditor for an array with x-widget: keyword-pattern-editor", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        keywordPatterns: {
          type: "array",
          "x-widget": "keyword-pattern-editor",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              segmentType: { type: "string" },
            },
            required: ["pattern", "segmentType"],
          },
        },
      },
      required: ["keywordPatterns"],
    };

    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{
          keywordPatterns: [
            { pattern: "(?i)pay\\s*stub", segmentType: "pay-stub" },
          ],
        }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("keyword-pattern-editor")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-036 Scenario 2: Add pattern inside the routed editor propagates to the
// form's onChange.
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-036 Scenario 2: Add pattern propagates through onChange", () => {
  it("clicking Add pattern fires the parent onChange with { keywordPatterns: [<default>] }", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        keywordPatterns: {
          type: "array",
          "x-widget": "keyword-pattern-editor",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              segmentType: { type: "string" },
            },
            required: ["pattern", "segmentType"],
          },
        },
      },
      required: ["keywordPatterns"],
    };

    const { spy } = mountWithSpy(schema, { keywordPatterns: [] });

    fireEvent.click(screen.getByTestId("keyword-pattern-editor-add"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({
      keywordPatterns: [{ pattern: "", segmentType: "" }],
    });
  });
});

// ---------------------------------------------------------------------------
// US-036 Scenario 3: arrays without the keyword-pattern-editor hint still
// use the generic renderer.
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-036 Scenario 3: no regression for plain array schemas", () => {
  it("does not mount KeywordPatternEditor for a plain array schema", () => {
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
      screen.queryByTestId("keyword-pattern-editor"),
    ).not.toBeInTheDocument();
    // Generic array renderer shows the "Add <singular>" button label.
    expect(
      screen.getByRole("button", { name: /Add Tag/i }),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// US-039: x-widget: "classification-rule-editor" routes to
// ClassificationRuleEditor
// ===========================================================================

// ---------------------------------------------------------------------------
// US-039 Scenario 1: routing — x-widget hint mounts ClassificationRuleEditor
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-039 Scenario 1: x-widget: classification-rule-editor routes to ClassificationRuleEditor", () => {
  it("renders ClassificationRuleEditor for an array with x-widget: classification-rule-editor", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        rules: {
          type: "array",
          "x-widget": "classification-rule-editor",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              resultType: { type: "string" },
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    scope: { type: "string" },
                    operator: { type: "string" },
                    value: { type: "string" },
                  },
                  required: ["scope", "operator", "value"],
                },
              },
            },
            required: ["name", "resultType", "patterns"],
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

    expect(
      screen.getByTestId("classification-rule-editor"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US-039 Scenario 2: edits propagate through onChange
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-039 Scenario 2: Add rule propagates through onChange", () => {
  it("clicking Add rule fires the parent onChange with { rules: [<default rule>] }", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        rules: {
          type: "array",
          "x-widget": "classification-rule-editor",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              resultType: { type: "string" },
              patterns: { type: "array", items: { type: "object" } },
            },
            required: ["name", "resultType", "patterns"],
          },
        },
      },
      required: ["rules"],
    };

    const { spy } = mountWithSpy(schema, { rules: [] });

    fireEvent.click(screen.getByTestId("classification-rule-editor-add"));

    expect(spy).toHaveBeenCalled();
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual({
      rules: [
        {
          name: "",
          resultType: "",
          patterns: [{ scope: "fullText", operator: "contains", value: "" }],
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// US-039 Scenario 3: no regression for arrays without the widget hint
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — US-039 Scenario 3: no regression for plain array schemas", () => {
  it("does not mount ClassificationRuleEditor for a plain array schema", () => {
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
      screen.queryByTestId("classification-rule-editor"),
    ).not.toBeInTheDocument();
    // Generic array renderer shows the "Add <singular>" button label.
    expect(
      screen.getByRole("button", { name: /Add Tag/i }),
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// x-widget: "json" — a nested setting with no form widget of its own
// ===========================================================================

describe("JsonSchemaForm — x-widget: json edits a nested setting as JSON", () => {
  const schema: JsonSchemaProperty = {
    type: "object",
    properties: {
      rules: {
        type: "array",
        title: "Rules",
        "x-widget": "json",
        items: {
          type: "object",
          properties: { select: { type: "object" } },
        },
      },
    },
  };

  const rulesBox = () => screen.getByRole("textbox", { name: "Rules" });

  it("shows the saved value as formatted JSON, not an unsupported field", () => {
    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ rules: [{ name: "a", select: { fields: ["x"] } }] }}
        onChange={() => undefined}
      />,
    );

    expect(rulesBox()).toHaveValue(
      JSON.stringify([{ name: "a", select: { fields: ["x"] } }], null, 2),
    );
    expect(screen.queryByText(/Unsupported field schema/)).toBeNull();
  });

  it("saves an edit when the field loses focus", () => {
    const { spy } = mountWithSpy(schema, { rules: [] });

    fireEvent.change(rulesBox(), { target: { value: '[{"name":"b"}]' } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.blur(rulesBox());

    expect(spy).toHaveBeenLastCalledWith({ rules: [{ name: "b" }] });
    expect(rulesBox()).toHaveValue(JSON.stringify([{ name: "b" }], null, 2));
  });

  it("keeps the saved value when the text is not valid JSON", () => {
    const { spy } = mountWithSpy(schema, { rules: [{ name: "a" }] });

    fireEvent.change(rulesBox(), { target: { value: '[{"name":' } });
    fireEvent.blur(rulesBox());

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/Not valid JSON/)).toBeInTheDocument();
  });

  it("keeps the saved value when the JSON is not a list", () => {
    const { spy } = mountWithSpy(schema, { rules: [{ name: "a" }] });

    fireEvent.change(rulesBox(), { target: { value: '{"name":"b"}' } });
    fireEvent.blur(rulesBox());

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/Expected a JSON list/)).toBeInTheDocument();
  });

  it("removes the setting when the text is cleared", () => {
    const { spy } = mountWithSpy(schema, { rules: [{ name: "a" }] });

    fireEvent.change(rulesBox(), { target: { value: "" } });
    fireEvent.blur(rulesBox());

    expect(spy).toHaveBeenLastCalledWith({});
  });

  it("saves a pending edit when the form is removed before the field loses focus", () => {
    const { spy, unmount } = mountWithSpy(schema, { rules: [] });

    fireEvent.change(rulesBox(), { target: { value: '[{"name":"c"}]' } });
    unmount();

    expect(spy).toHaveBeenLastCalledWith({ rules: [{ name: "c" }] });
  });
});

describe("JsonSchemaForm — x-widget: textarea", () => {
  it("edits a long string in a multi-line field", () => {
    const { spy } = mountWithSpy(
      {
        type: "object",
        properties: {
          prompt: { type: "string", title: "Prompt", "x-widget": "textarea" },
        },
      },
      {},
    );

    const box = screen.getByRole("textbox", { name: "Prompt" });
    expect(box.tagName).toBe("TEXTAREA");
    fireEvent.change(box, { target: { value: "line one\nline two" } });
    fireEvent.blur(box);

    expect(spy).toHaveBeenLastCalledWith({ prompt: "line one\nline two" });
  });
});

describe("JsonSchemaForm — every catalog step's settings", () => {
  it.each(
    listActivityTypes(),
  )("%s renders without an unsupported field", (activityType) => {
    renderForm(
      <JsonSchemaForm
        schema={getActivityParametersJsonSchema(activityType)}
        value={{}}
        onChange={() => undefined}
      />,
    );

    expect(screen.queryByText(/Unsupported field schema/)).toBeNull();
  });
});

describe("JsonSchemaForm — a switch with no saved value", () => {
  const schema: JsonSchemaProperty = {
    type: "object",
    properties: {
      onByDefault: {
        type: "boolean",
        title: "On by default",
        "x-default": true,
      },
      noDefault: { type: "boolean", title: "No default" },
    },
  };

  it("shows the default the step applies", () => {
    renderForm(
      <JsonSchemaForm schema={schema} value={{}} onChange={() => undefined} />,
    );

    expect(screen.getByRole("switch", { name: "On by default" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "No default" }),
    ).not.toBeChecked();
  });

  it("shows a saved value over the default", () => {
    renderForm(
      <JsonSchemaForm
        schema={schema}
        value={{ onByDefault: false }}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "On by default" }),
    ).not.toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// Text and number fields commit once per burst of typing. Each commit
// replaces the step's parameters in the workflow, so a commit per keystroke
// would rewrite the workflow on every one.
// ---------------------------------------------------------------------------

describe("JsonSchemaForm — typing commits once per burst", () => {
  const schema: JsonSchemaProperty = {
    type: "object",
    properties: {
      status: { type: "string", title: "Status" },
      threshold: { type: "number", title: "Threshold" },
      pages: { type: "integer", title: "Pages", minimum: 1 },
    },
  };

  async function waitPastDebounce() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
  }

  it("a text field typed character by character commits once, after typing pauses", async () => {
    const { spy } = mountWithSpy(schema, { status: "on" });
    const input = screen.getByLabelText("Status") as HTMLInputElement;

    for (const value of ["ong", "ongo", "ongoi", "ongoing"]) {
      fireEvent.change(input, { target: { value } });
    }
    expect(input.value).toBe("ongoing");
    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(spy.mock.lastCall?.[0]).toEqual({ status: "ongoing" });
    await waitPastDebounce();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["number", "Threshold", "threshold", ["0", "0.", "0.8", "0.85"], 0.85],
    ["integer", "Pages", "pages", ["1", "12", "120"], 120],
  ] as const)("a %s field typed character by character commits the whole number once", async (_type, label, key, steps, expected) => {
    const { spy } = mountWithSpy(schema, {});
    const input = screen.getByLabelText(label) as HTMLInputElement;

    for (const value of steps) {
      fireEvent.change(input, { target: { value } });
    }
    expect(spy).not.toHaveBeenCalled();

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(spy.mock.lastCall?.[0]).toEqual({ [key]: expected });
    await waitPastDebounce();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("emptying a number field removes the setting once it is committed", () => {
    const { spy } = mountWithSpy(schema, { threshold: 0.5, status: "x" });
    const input = screen.getByLabelText("Threshold");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.lastCall?.[0]).toEqual({ status: "x" });
  });
});
