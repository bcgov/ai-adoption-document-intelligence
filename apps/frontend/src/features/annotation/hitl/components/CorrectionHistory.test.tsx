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
  author: { type: "user" as const, email: "reviewer@example.com" },
  ...over,
});

describe("CorrectionHistory", () => {
  it("shows what changed, from what, to what", () => {
    render(<CorrectionHistory corrections={[correction()]} />);
    expect(screen.getByText("invoiceTotal")).toBeInTheDocument();
    expect(screen.getByTestId("correction-original")).toHaveTextContent(
      "1240.00",
    );
    expect(screen.getByTestId("correction-corrected")).toHaveTextContent(
      "1420.00",
    );
  });

  it("says so when there are no corrections yet", () => {
    render(<CorrectionHistory corrections={[]} />);
    expect(
      screen.getByText("No corrections submitted yet."),
    ).toBeInTheDocument();
  });

  it("shows the user's email when a user made the correction", () => {
    render(
      <CorrectionHistory
        corrections={[
          correction({ author: { type: "user", email: "a@b.com" } }),
        ]}
      />,
    );
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
  });

  it("shows that an api key was used", () => {
    render(
      <CorrectionHistory
        corrections={[correction({ author: { type: "api_key" } })]}
      />,
    );
    expect(screen.getByText("API key")).toBeInTheDocument();
  });

  it("shows the original and corrected values in separate boxes", () => {
    render(
      <CorrectionHistory
        corrections={[
          correction({ originalValue: "1240.00", correctedValue: "1420.00" }),
        ]}
      />,
    );
    expect(screen.getByTestId("correction-original")).toHaveTextContent(
      "1240.00",
    );
    expect(screen.getByTestId("correction-corrected")).toHaveTextContent(
      "1420.00",
    );
  });

  it("shows unknown when no author was recorded", () => {
    render(
      <CorrectionHistory
        corrections={[correction({ author: { type: "unknown" } })]}
      />,
    );
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
