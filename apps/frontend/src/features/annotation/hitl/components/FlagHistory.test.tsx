import { MantineProvider } from "@mantine/core";
import { render as rtlRender, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlagHistory, ReviewFlag } from "./FlagHistory";

const render = (ui: React.ReactNode) =>
  rtlRender(<MantineProvider>{ui}</MantineProvider>);

const flag = (over: Partial<ReviewFlag> = {}): ReviewFlag => ({
  id: "f1",
  note: "Signature is illegible",
  raisedAt: "2026-07-25T09:00:00.000Z",
  raisedBy: "reviewer@example.com",
  resolved: false,
  resolvedAt: null,
  resolvedBy: null,
  ...over,
});

describe("FlagHistory", () => {
  it("says so when there are no flags and no flag note", () => {
    render(
      <FlagHistory
        flags={[]}
        readOnly={false}
        isResolvingFlag={false}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText("No active flags.")).toBeInTheDocument();
  });

  it("shows the session's flag note when there are no flags", () => {
    render(
      <FlagHistory
        flags={[]}
        flagNote="Stopped because the image was blurry"
        readOnly={false}
        isResolvingFlag={false}
        onResolve={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Stopped because the image was blurry"),
    ).toBeInTheDocument();
  });

  it("shows an unresolved flag with a clickable Resolve button", () => {
    const onResolve = vi.fn();
    render(
      <FlagHistory
        flags={[flag()]}
        readOnly={false}
        isResolvingFlag={false}
        onResolve={onResolve}
      />,
    );
    expect(screen.getByText("Signature is illegible")).toBeInTheDocument();
    expect(
      screen.getByText("Raised by reviewer@example.com"),
    ).toBeInTheDocument();
    screen.getByRole("button", { name: "Resolve" }).click();
    expect(onResolve).toHaveBeenCalledWith("f1");
  });

  it("disables the Resolve button in read-only mode", () => {
    render(
      <FlagHistory
        flags={[flag()]}
        readOnly
        isResolvingFlag={false}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
  });

  it("shows a resolved flag as a disabled Resolved button with who/when", () => {
    render(
      <FlagHistory
        flags={[
          flag({
            resolved: true,
            resolvedBy: "lead@example.com",
            resolvedAt: "2026-07-26T09:00:00.000Z",
          }),
        ]}
        readOnly={false}
        isResolvingFlag={false}
        onResolve={vi.fn()}
      />,
    );
    const resolvedButton = screen.getByRole("button", { name: "Resolved" });
    expect(resolvedButton).toBeDisabled();
    expect(
      screen.getByText("Resolved by lead@example.com"),
    ).toBeInTheDocument();
  });
});
