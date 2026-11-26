import { describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../../../../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "../../../../ui";
import { ViewerToolbar } from "./ViewerToolbar";

function renderToolbar(totalPages: number) {
  const handlers = {
    onPageChange: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
  };
  render(
    <MantineProvider>
      <ViewerToolbar
        currentPage={1}
        totalPages={totalPages}
        zoom={1.25}
        {...handlers}
      />
    </MantineProvider>,
  );
  return handlers;
}

describe("ViewerToolbar", () => {
  it("shows the page box and count for a multi-page document", () => {
    renderToolbar(2);

    expect(screen.getByTestId("bcds-number-field")).toHaveValue(1);
    expect(screen.getByText("/ 2")).toBeInTheDocument();
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("leaves out the page controls for a single page, keeping zoom", () => {
    renderToolbar(1);

    expect(screen.queryByTestId("bcds-number-field")).not.toBeInTheDocument();
    expect(screen.queryByText("/ 1")).not.toBeInTheDocument();
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("calls the zoom handlers", () => {
    const handlers = renderToolbar(1);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));

    expect(handlers.onZoomIn).toHaveBeenCalledTimes(1);
    expect(handlers.onZoomOut).toHaveBeenCalledTimes(1);
    expect(handlers.onZoomReset).toHaveBeenCalledTimes(1);
  });
});
