import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconActionButton } from "./IconActionButton";

describe("IconActionButton adapter", () => {
  it("renders icon-only button with tooltip and aria-label", () => {
    render(
      <IconActionButton
        tooltip="Delete"
        icon={<span data-testid="icon">×</span>}
        onClick={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("supports stopPropagation on click", () => {
    const rowClick = vi.fn();
    const buttonClick = vi.fn();

    render(
      <div role="row" onClick={rowClick}>
        <IconActionButton
          tooltip="Delete"
          icon={<span>×</span>}
          onClick={(event) => {
            event.stopPropagation();
            buttonClick();
          }}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(buttonClick).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });
});
