import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MantineProvider } from "../../../../ui";
import { ReviewToolbar } from "./ReviewToolbar";

const handlers = {
  onBack: vi.fn(),
  onApprove: vi.fn(),
  onFlag: vi.fn(),
  onSkip: vi.fn(),
  onSave: vi.fn(),
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

  it("marks Flag with a count when the document has active flags", () => {
    render(
      <MantineProvider>
        <ReviewToolbar {...handlers} activeFlagCount={2} />
      </MantineProvider>,
    );

    expect(screen.getByLabelText("2 active flags")).toBeInTheDocument();
  });

  it("leaves Flag unmarked when there are no active flags", () => {
    render(
      <MantineProvider>
        <ReviewToolbar {...handlers} activeFlagCount={0} />
      </MantineProvider>,
    );

    expect(screen.queryByLabelText(/active flags?/i)).not.toBeInTheDocument();
  });
});
