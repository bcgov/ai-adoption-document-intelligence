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

  it("marks Flag when the session carries a note from an earlier flag", () => {
    render(
      <MantineProvider>
        <ReviewToolbar {...handlers} flagNote="Date on page 1 is ambiguous" />
      </MantineProvider>,
    );

    expect(screen.getByLabelText("Flag has a note")).toBeInTheDocument();
  });

  it("leaves Flag unmarked when there is no note", () => {
    render(
      <MantineProvider>
        <ReviewToolbar {...handlers} flagNote={null} />
      </MantineProvider>,
    );

    expect(screen.queryByLabelText("Flag has a note")).not.toBeInTheDocument();
  });
});
