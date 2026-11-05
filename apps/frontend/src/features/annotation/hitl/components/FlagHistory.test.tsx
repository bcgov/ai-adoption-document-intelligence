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
        resolvingFlagId={null}
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
        resolvingFlagId={null}
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
        resolvingFlagId={null}
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
        resolvingFlagId={null}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
  });

  it("only shows a loading spinner on the Resolve button for the flag being resolved", () => {
    const flagOne = flag({ id: "f1" });
    const flagTwo = flag({ id: "f2", note: "Second flag" });
    render(
      <FlagHistory
        flags={[flagOne, flagTwo]}
        readOnly={false}
        resolvingFlagId="f1"
        onResolve={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Resolve" });
    expect(buttons[0]).toHaveAttribute("data-pending", "true");
    expect(buttons[1]).not.toHaveAttribute("data-pending", "true");
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
        resolvingFlagId={null}
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
