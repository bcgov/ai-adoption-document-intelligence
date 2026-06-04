import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

describe("Tooltip adapter", () => {
  it("wraps children with BC DS tooltip trigger", () => {
    render(
      <Tooltip label="Help text">
        <button type="button">Action</button>
      </Tooltip>,
    );

    expect(screen.getByTestId("bcds-tooltip-trigger")).toBeInTheDocument();
    expect(screen.getByText("Help text")).toBeInTheDocument();
  });

  it("returns children unchanged when disabled", () => {
    render(
      <Tooltip label="Help text" disabled>
        <button type="button">Action</button>
      </Tooltip>,
    );

    expect(
      screen.queryByTestId("bcds-tooltip-trigger"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });
});
