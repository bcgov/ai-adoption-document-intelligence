/**
 * Tests for FieldListEditor (US-120).
 *
 * Each `describe` block maps to one acceptance scenario from
 * feature-docs/20260530-workflow-builder-phase8-document-sources/user_stories/US-120-field-list-editor.md.
 *
 * Scope of US-120: rich x-widget editor for `source.api`'s
 * `fields[]` parameter. The widget renders 6 columns per row (name /
 * type / kind / required / description / default) and is registered in
 * the `JsonSchemaForm` x-widget dispatch under the key
 * `"field-list-editor"`.
 */

import "@testing-library/jest-dom";

import { ARTIFACT_REGISTRY, type FieldDescriptor } from "@ai-di/graph-workflow";
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { JsonSchemaForm } from "../json-schema-form/JsonSchemaForm";
import type { JsonSchemaProperty } from "../json-schema-form/types";

import { FieldListEditor } from "./FieldListEditor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEditor(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

/**
 * Controlled wrapper around FieldListEditor — drives the editor with React
 * state and records the latest `onChange` payload.
 */
function mountWithSpy(initial: FieldDescriptor[]) {
  const spy = vi.fn<(next: FieldDescriptor[]) => void>();

  function Wrapper() {
    const [value, setValue] = useState<FieldDescriptor[]>(initial);
    return (
      <FieldListEditor
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
// Scenario 1: Registered as the `field-list-editor` x-widget
// ---------------------------------------------------------------------------

describe("FieldListEditor — Scenario 1: x-widget dispatch", () => {
  it("JsonSchemaForm renders FieldListEditor (not the default array renderer) for x-widget: field-list-editor", () => {
    const schema: JsonSchemaProperty = {
      type: "object",
      properties: {
        fields: {
          type: "array",
          title: "Fields",
          "x-widget": "field-list-editor",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              required: { type: "boolean" },
            },
            required: ["name", "type", "required"],
          },
        },
      },
      required: ["fields"],
    };

    renderEditor(
      <JsonSchemaForm
        schema={schema}
        value={{ fields: [] }}
        onChange={() => undefined}
      />,
    );

    // Dispatching to the rich editor renders the FieldListEditor's
    // top-level scaffold (`data-testid="field-list-editor"`). The default
    // array renderer would render Mantine's generic add button labelled
    // "Add Field" via the singularise helper but NOT the data-testid.
    expect(screen.getByTestId("field-list-editor")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Per-row columns + add/remove
// ---------------------------------------------------------------------------

describe("FieldListEditor — Scenario 2: per-row columns + add/remove", () => {
  it("renders all 6 columns for an existing row", () => {
    const value: FieldDescriptor[] = [
      {
        name: "documentUrl",
        type: "string",
        kind: "Document",
        required: true,
        description: "URL to the document blob",
        defaultValue: "https://example.com/doc.pdf",
      },
    ];

    renderEditor(<FieldListEditor value={value} onChange={() => undefined} />);

    const row = screen.getByTestId("field-list-editor-row-0");
    expect(row).toBeInTheDocument();

    // 6 columns / inputs are present:
    expect(
      within(row).getByTestId("field-list-editor-name-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("field-list-editor-type-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("field-list-editor-kind-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("field-list-editor-required-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("field-list-editor-description-0"),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId("field-list-editor-default-0"),
    ).toBeInTheDocument();
  });

  it('clicking "Add field" appends a default row with sane defaults', () => {
    const { spy } = mountWithSpy([]);

    fireEvent.click(screen.getByTestId("field-list-editor-add"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual([{ name: "", type: "string", required: false }]);
  });

  it("clicking the trash icon removes that row", () => {
    const { spy } = mountWithSpy([
      { name: "alpha", type: "string", required: false },
      { name: "beta", type: "number", required: true },
    ]);

    fireEvent.click(screen.getByTestId("field-list-editor-remove-0"));

    expect(spy).toHaveBeenCalledTimes(1);
    const next = spy.mock.lastCall?.[0];
    expect(next).toEqual([{ name: "beta", type: "number", required: true }]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: `kind` Select wired to Phase 3 registry
// ---------------------------------------------------------------------------

describe("FieldListEditor — Scenario 3: kind Select wired to ARTIFACT_REGISTRY", () => {
  it("opens to reveal options sourced from ARTIFACT_REGISTRY (including Document)", () => {
    renderEditor(
      <FieldListEditor
        value={[{ name: "foo", type: "string", required: false }]}
        onChange={() => undefined}
      />,
    );

    const kindSelect = screen.getByTestId(
      "field-list-editor-kind-0",
    ) as HTMLInputElement;
    fireEvent.mouseDown(kindSelect);
    fireEvent.click(kindSelect);

    // The Mantine Select renders a portal with all dropdown items as
    // anchor-like roleable elements. We assert at least one known
    // registry-derived option exists — `Document` is the canonical
    // example used in the spec.
    const documentMeta = ARTIFACT_REGISTRY.Document;
    expect(documentMeta.displayName).toBe("Document");
    // At least one element matching the Document label should appear when
    // the dropdown is open.
    expect(screen.getAllByText("Document").length).toBeGreaterThan(0);
  });

  it("blank kind persists as undefined (no kind key) on the FieldDescriptor", () => {
    const { spy } = mountWithSpy([
      {
        name: "foo",
        type: "string",
        kind: "Document",
        required: false,
      },
    ]);

    // Find the Document item in the open dropdown; first re-select via the
    // wildcard "—" sentinel option to unset the kind.
    const kindSelect = screen.getByTestId(
      "field-list-editor-kind-0",
    ) as HTMLInputElement;
    fireEvent.mouseDown(kindSelect);

    // "—" is the wildcard label per kind-select-options.ts.
    const wildcardOptions = screen.getAllByText("—");
    fireEvent.click(wildcardOptions[0]);

    expect(spy).toHaveBeenCalled();
    const last = spy.mock.lastCall?.[0];
    expect(last).toBeDefined();
    expect(last?.[0].kind).toBeUndefined();
    // Confirm the persisted object DOES NOT carry the `kind` key.
    expect(last?.[0] !== undefined && "kind" in last[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Round-trip — save → load preserves all field props
// ---------------------------------------------------------------------------

describe("FieldListEditor — Scenario 4: round-trip preserves field props", () => {
  it("preserves name / type / kind / required / description / default across mount", () => {
    const initial: FieldDescriptor[] = [
      {
        name: "documentUrl",
        type: "string",
        kind: "Document",
        required: true,
        description: "Document blob URL",
        defaultValue: "https://example.com/doc.pdf",
      },
      {
        name: "pageCount",
        type: "number",
        required: false,
        description: "Expected page count",
        defaultValue: 12,
      },
      {
        name: "settings",
        type: "object",
        kind: "Artifact",
        required: false,
        defaultValue: { strict: true, retries: 3 },
      },
    ];

    renderEditor(
      <FieldListEditor value={initial} onChange={() => undefined} />,
    );

    // Row 0 — string + Document + default URL
    const row0 = screen.getByTestId("field-list-editor-row-0");
    expect(
      (within(row0).getByTestId("field-list-editor-name-0") as HTMLInputElement)
        .value,
    ).toBe("documentUrl");
    expect(
      (within(row0).getByTestId("field-list-editor-type-0") as HTMLInputElement)
        .value,
    ).toBe("string");
    expect(
      (
        within(row0).getByTestId(
          "field-list-editor-required-0",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        within(row0).getByTestId(
          "field-list-editor-description-0",
        ) as HTMLInputElement
      ).value,
    ).toBe("Document blob URL");
    // JsonInput uses a textarea — its value is the stringified default.
    const default0 = within(row0).getByTestId(
      "field-list-editor-default-0",
    ) as HTMLTextAreaElement;
    expect(JSON.parse(default0.value)).toBe("https://example.com/doc.pdf");

    // Row 1 — number / 12
    const row1 = screen.getByTestId("field-list-editor-row-1");
    expect(
      (within(row1).getByTestId("field-list-editor-name-1") as HTMLInputElement)
        .value,
    ).toBe("pageCount");
    expect(
      (within(row1).getByTestId("field-list-editor-type-1") as HTMLInputElement)
        .value,
    ).toBe("number");
    const default1 = within(row1).getByTestId(
      "field-list-editor-default-1",
    ) as HTMLTextAreaElement;
    expect(JSON.parse(default1.value)).toBe(12);

    // Row 2 — object / non-trivial JSON default
    const row2 = screen.getByTestId("field-list-editor-row-2");
    const default2 = within(row2).getByTestId(
      "field-list-editor-default-2",
    ) as HTMLTextAreaElement;
    expect(JSON.parse(default2.value)).toEqual({ strict: true, retries: 3 });
  });

  it("editing a row's defaultValue and blurring writes a parsed JSON value back through onChange", () => {
    const { spy } = mountWithSpy([
      { name: "foo", type: "object", required: false },
    ]);

    const defaultInput = screen.getByTestId(
      "field-list-editor-default-0",
    ) as HTMLTextAreaElement;
    fireEvent.change(defaultInput, { target: { value: '{"a":1}' } });
    fireEvent.blur(defaultInput);

    expect(spy).toHaveBeenCalled();
    const last = spy.mock.lastCall?.[0];
    expect(last?.[0].defaultValue).toEqual({ a: 1 });
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Validation — duplicate names + invalid regex
// ---------------------------------------------------------------------------

describe("FieldListEditor — Scenario 5: validation messages", () => {
  it("shows the regex error inline when a name fails the URL-safe regex", () => {
    const { spy } = mountWithSpy([
      { name: "", type: "string", required: false },
    ]);

    const nameInput = screen.getByTestId(
      "field-list-editor-name-0",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "my field" } });

    expect(spy).toHaveBeenCalled();
    expect(
      screen.getByText(
        /Field name must match \/\^\[a-zA-Z_\]\[a-zA-Z0-9_\]\*\$\//,
      ),
    ).toBeInTheDocument();
  });

  it("shows a duplicate-name error inline when two rows share the same name", () => {
    const { spy } = mountWithSpy([
      { name: "documentUrl", type: "string", required: false },
      { name: "", type: "string", required: false },
    ]);

    const secondName = screen.getByTestId(
      "field-list-editor-name-1",
    ) as HTMLInputElement;
    fireEvent.change(secondName, { target: { value: "documentUrl" } });

    expect(spy).toHaveBeenCalled();
    // Both rows surface the duplicate-name error (the error is computed
    // relative to the full fields[] array, so once a duplicate exists
    // every duplicating row carries it).
    expect(
      screen.getAllByText("Field name must be unique within this source"),
    ).toHaveLength(2);
  });

  it('disables "Add field" while any row is invalid (empty / duplicate / regex-failing)', () => {
    mountWithSpy([{ name: "", type: "string", required: false }]);

    // Empty-name row → "Add field" disabled.
    expect(screen.getByTestId("field-list-editor-add")).toBeDisabled();
  });
});
