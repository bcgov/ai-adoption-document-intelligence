import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityNode } from "../../types/graph-workflow";
import { FlattenClassifiedDocumentsForm } from "./FlattenClassifiedDocumentsForm";

function makeNode(
  overrides: Partial<ActivityNode["parameters"]> = {},
): ActivityNode {
  return {
    id: "flattenDocs",
    type: "activity",
    label: "Flatten Classified Documents",
    activityType: "document.flattenClassifiedDocuments",
    inputs: [],
    outputs: [],
    parameters: overrides,
  };
}

const renderForm = (node: ActivityNode, onChange = vi.fn()) =>
  render(
    <MantineProvider>
      <FlattenClassifiedDocumentsForm node={node} onChange={onChange} />
    </MantineProvider>,
  );

describe("FlattenClassifiedDocumentsForm", () => {
  it("renders the filter labels input", () => {
    const node = makeNode();
    renderForm(node);

    expect(screen.getByLabelText(/filter labels/i)).toBeInTheDocument();
  });

  it("shows existing filterLabels joined by comma when provided", () => {
    const node = makeNode({ filterLabels: ["invoice", "receipt"] });
    renderForm(node);

    expect(screen.getByDisplayValue("invoice, receipt")).toBeInTheDocument();
  });

  it("shows empty input when filterLabels is not set", () => {
    const node = makeNode();
    renderForm(node);

    expect(screen.getByLabelText(/filter labels/i)).toHaveValue("");
  });

  it("calls onChange with parsed filterLabels array on input change", () => {
    const node = makeNode();
    const onChange = vi.fn();
    renderForm(node, onChange);

    fireEvent.change(screen.getByLabelText(/filter labels/i), {
      target: { value: "invoice, receipt" },
    });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.parameters.filterLabels).toContain("invoice");
    expect(lastCall.parameters.filterLabels).toContain("receipt");
  });

  it("sets filterLabels to undefined when input is cleared", () => {
    const node = makeNode({ filterLabels: ["invoice"] });
    const onChange = vi.fn();
    renderForm(node, onChange);

    fireEvent.change(screen.getByLabelText(/filter labels/i), {
      target: { value: "" },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({ filterLabels: undefined }),
      }),
    );
  });

  it("renders the section heading", () => {
    const node = makeNode();
    renderForm(node);

    expect(
      screen.getByText(/flatten classified documents parameters/i),
    ).toBeInTheDocument();
  });
});
