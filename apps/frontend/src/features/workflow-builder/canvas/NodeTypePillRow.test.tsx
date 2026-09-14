import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeTypePillRow } from "./NodeTypePillRow";

function renderWithMantine(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("NodeTypePillRow", () => {
  it("renders an arrow row when both sides have exactly one typed port", () => {
    renderWithMantine(
      <NodeTypePillRow
        inputs={[{ portName: "doc", kind: "Document" }]}
        outputs={[{ portName: "seg", kind: "Segment[]" }]}
      />,
    );
    expect(screen.getByText("DOCUMENT")).toBeInTheDocument();
    expect(screen.getByText("SEGMENT[]")).toBeInTheDocument();
    expect(screen.getByTestId("node-type-pill-row")).toHaveAttribute(
      "data-shape",
      "arrow",
    );
    expect(screen.getByTestId("pill-row-arrow")).toHaveTextContent("→");
  });

  it("renders a stacked variant when either side has multiple ports", () => {
    renderWithMantine(
      <NodeTypePillRow
        inputs={[
          { portName: "doc", kind: "Document" },
          { portName: "extra", kind: "Segment[]" },
        ]}
        outputs={[{ portName: "out", kind: "Document" }]}
      />,
    );
    expect(screen.getByTestId("node-type-pill-row")).toHaveAttribute(
      "data-shape",
      "stacked",
    );
    expect(screen.getByText("in:doc: Document")).toBeInTheDocument();
    expect(screen.getByText("in:extra: Segment[]")).toBeInTheDocument();
    expect(screen.getByText("out:out: Document")).toBeInTheDocument();
  });

  it("renders nothing when every port is untyped (kind undefined)", () => {
    const { container } = renderWithMantine(
      <NodeTypePillRow
        inputs={[{ portName: "doc", kind: undefined }]}
        outputs={[{ portName: "out", kind: undefined }]}
      />,
    );
    // MantineProvider injects a <style data-mantine-styles> sibling, so we
    // assert specifically on the absence of the pill-row marker attribute
    // rather than on `container.firstChild`.
    expect(
      container.querySelector('[data-testid="node-type-pill-row"]'),
    ).toBeNull();
  });

  it("renders single-side row when only inputs are typed", () => {
    renderWithMantine(
      <NodeTypePillRow
        inputs={[{ portName: "doc", kind: "Document" }]}
        outputs={[]}
      />,
    );
    expect(screen.getByTestId("node-type-pill-row")).toHaveAttribute(
      "data-shape",
      "arrow",
    );
    expect(screen.queryByTestId("pill-row-arrow")).not.toBeInTheDocument();
    expect(screen.getByText("DOCUMENT")).toBeInTheDocument();
  });
});
