import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NodeStatusDot } from "./NodeStatusDot";

describe("NodeStatusDot", () => {
  it("renders nothing when status is 'ok'", () => {
    const { container } = render(<NodeStatusDot status="ok" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an amber dot for ambiguous", () => {
    render(<NodeStatusDot status="ambiguous" />);
    expect(screen.getByTestId("node-status-dot")).toHaveAttribute(
      "data-status",
      "ambiguous",
    );
  });

  it("renders a red dot for unsatisfied", () => {
    render(<NodeStatusDot status="unsatisfied" />);
    expect(screen.getByTestId("node-status-dot")).toHaveAttribute(
      "data-status",
      "unsatisfied",
    );
  });
});
