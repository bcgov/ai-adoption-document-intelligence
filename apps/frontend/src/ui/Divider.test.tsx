import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Divider } from "./Divider";

describe("Divider adapter", () => {
  it("renders BC DS separator horizontally", () => {
    render(<Divider />);
    expect(screen.getByTestId("bcds-separator")).toBeInTheDocument();
  });

  it("renders a vertical separator role", () => {
    const { container } = render(<Divider orientation="vertical" />);
    expect(container.querySelector('[role="separator"]')).toBeInTheDocument();
  });

  it("renders labeled dividers", () => {
    render(<Divider label="Section" />);
    expect(screen.getByText("Section")).toBeInTheDocument();
  });
});
