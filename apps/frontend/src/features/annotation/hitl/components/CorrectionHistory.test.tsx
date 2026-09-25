import { MantineProvider } from "@mantine/core";
import { render as rtlRender, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CorrectionHistory } from "./CorrectionHistory";

const render = (ui: React.ReactNode) =>
  rtlRender(<MantineProvider>{ui}</MantineProvider>);

const correction = (
  over: Partial<
    Parameters<typeof CorrectionHistory>[0]["corrections"][number]
  > = {},
) => ({
  id: "c1",
  fieldKey: "invoiceTotal",
  originalValue: "1240.00",
  correctedValue: "1420.00",
  action: "corrected",
  createdAt: "2026-07-26T09:00:00.000Z",
  ...over,
});

describe("CorrectionHistory", () => {
  it("shows what changed, from what, to what", () => {
    render(<CorrectionHistory corrections={[correction()]} />);
    expect(screen.getByText("invoiceTotal")).toBeInTheDocument();
    expect(screen.getByText(/1240\.00/)).toBeInTheDocument();
    expect(screen.getByText(/1420\.00/)).toBeInTheDocument();
  });

  it("says so when there are no corrections yet", () => {
    render(<CorrectionHistory corrections={[]} />);
    expect(
      screen.getByText("No corrections submitted yet."),
    ).toBeInTheDocument();
  });
});
