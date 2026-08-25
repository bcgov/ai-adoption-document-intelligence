import { MantineProvider } from "@mantine/core";
import { render as rtlRender, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CorrectionHistory } from "./CorrectionHistory";

const render = (ui: React.ReactNode) =>
  rtlRender(<MantineProvider>{ui}</MantineProvider>);

/**
 * G-058 — a human correction left no trail anyone could read.
 *
 * The data was always recorded: `submitCorrections` writes per-field rows with
 * original and corrected values plus an audit event. What was missing on the
 * surface was WHO — the trail showed the field, the action, the timestamp and
 * the before/after, but never the reviewer, and `actor_id` alone is a cuid.
 */
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
  it("names the reviewer who made the corrections (G-058)", () => {
    render(
      <CorrectionHistory
        corrections={[correction()]}
        reviewerEmail="alex@example.com"
      />,
    );
    expect(screen.getByTestId("correction-history-reviewer")).toHaveTextContent(
      "Corrected by alex@example.com",
    );
  });

  it("says the reviewer is unknown rather than inventing one", () => {
    // An API-key actor has no linked user, so there is genuinely no email.
    render(<CorrectionHistory corrections={[correction()]} />);
    expect(screen.getByTestId("correction-history-reviewer")).toHaveTextContent(
      "an unknown reviewer",
    );
  });

  it("still shows what changed, from what, to what", () => {
    render(
      <CorrectionHistory
        corrections={[correction()]}
        reviewerEmail="alex@example.com"
      />,
    );
    expect(screen.getByText("invoiceTotal")).toBeInTheDocument();
    expect(screen.getByText(/1240\.00/)).toBeInTheDocument();
    expect(screen.getByText(/1420\.00/)).toBeInTheDocument();
  });

  it("shows no reviewer line when there is nothing to attribute", () => {
    render(<CorrectionHistory corrections={[]} reviewerEmail="a@b.c" />);
    expect(
      screen.queryByTestId("correction-history-reviewer"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No corrections submitted yet."),
    ).toBeInTheDocument();
  });
});
