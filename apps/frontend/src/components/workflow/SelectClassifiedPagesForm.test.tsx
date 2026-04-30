import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityNode } from "../../types/graph-workflow";
import { SelectClassifiedPagesForm } from "./SelectClassifiedPagesForm";

function makeNode(
  overrides: Partial<ActivityNode["parameters"]> = {},
): ActivityNode {
  return {
    id: "selectPages",
    type: "activity",
    label: "Select Classified Pages",
    activityType: "document.selectClassifiedPages",
    inputs: [],
    outputs: [],
    parameters: overrides,
  };
}

const renderForm = (node: ActivityNode, onChange = vi.fn()) =>
  render(
    <MantineProvider>
      <SelectClassifiedPagesForm node={node} onChange={onChange} />
    </MantineProvider>,
  );

describe("SelectClassifiedPagesForm", () => {
  it("renders the target label input", () => {
    const node = makeNode();
    renderForm(node);

    expect(screen.getByLabelText(/target label/i)).toBeInTheDocument();
  });

  it("shows existing targetLabel value from node parameters", () => {
    const node = makeNode({ targetLabel: "invoice" });
    renderForm(node);

    expect(screen.getByDisplayValue("invoice")).toBeInTheDocument();
  });

  it("calls onChange with updated targetLabel when value changes", () => {
    const node = makeNode();
    const onChange = vi.fn();
    renderForm(node, onChange);

    fireEvent.change(screen.getByLabelText(/target label/i), {
      target: { value: "receipt" },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({ targetLabel: "receipt" }),
      }),
    );
  });

  it("sets targetLabel to undefined when input is cleared", () => {
    const node = makeNode({ targetLabel: "invoice" });
    const onChange = vi.fn();
    renderForm(node, onChange);

    fireEvent.change(screen.getByLabelText(/target label/i), {
      target: { value: "" },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({ targetLabel: undefined }),
      }),
    );
  });

  it("renders the section heading", () => {
    const node = makeNode();
    renderForm(node);

    expect(
      screen.getByText(/select classified pages parameters/i),
    ).toBeInTheDocument();
  });
});
