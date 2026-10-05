import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "../../../../ui";
import { ReviewToolbar } from "./ReviewToolbar";

const handlers = {
  onBack: vi.fn(),
  onApprove: vi.fn(),
  onFlag: vi.fn(),
  onSkip: vi.fn(),
};

describe("ReviewToolbar", () => {
  it("offers Reject when the page passes a reject handler", () => {
    render(
      <MantineProvider>
        <ReviewToolbar {...handlers} onReject={vi.fn()} />
      </MantineProvider>,
    );

    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("hides Reject without one, as when labelling a dataset", () => {
    render(
      <MantineProvider>
        <ReviewToolbar {...handlers} />
      </MantineProvider>,
    );

    expect(
      screen.queryByRole("button", { name: /reject/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /approve/i }),
    ).toBeInTheDocument();
  });
});
