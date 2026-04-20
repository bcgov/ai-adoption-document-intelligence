import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorDetectionAnalysis as ErrorDetectionAnalysisType } from "../api/errorDetectionAnalysis";
import { ErrorDetectionAnalysis } from "./ErrorDetectionAnalysis";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseErrorDetectionAnalysis = vi.fn();

vi.mock("../api/errorDetectionAnalysis", () => ({
  fetchErrorDetectionAnalysis: vi.fn(),
  useErrorDetectionAnalysis: () => mockUseErrorDetectionAnalysis(),
}));

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleAnalysis: ErrorDetectionAnalysisType = {
  runId: "r1",
  notReady: false,
  fields: [
    {
      name: "invoiceNumber",
      evaluatedCount: 4,
      errorCount: 2,
      errorRate: 0.5,
      curve: Array.from({ length: 101 }, (_, i) => ({
        threshold: i / 100,
        tp: i >= 50 ? 2 : 0,
        fp: i >= 96 ? 2 : 0,
        fn: i >= 50 ? 0 : 2,
        tn: i >= 96 ? 0 : 2,
      })),
      suggestedCatch90: 0.5,
      suggestedBestBalance: 0.5,
      suggestedMinimizeReview: 0.7,
    },
  ],
  excludedFields: ["notes"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderComponent = () => {
  return render(
    <MantineProvider>
      <ErrorDetectionAnalysis projectId="p1" runId="r1" />
    </MantineProvider>,
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ErrorDetectionAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseErrorDetectionAnalysis.mockReturnValue({
      analysis: sampleAnalysis,
      isLoading: false,
      error: null,
    });
  });

  it("renders one row per evaluable field with field name and error rate", async () => {
    renderComponent();
    expect(await screen.findByText("invoiceNumber")).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it("shows excluded fields footnote", async () => {
    renderComponent();
    expect(await screen.findByText(/1 field excluded/i)).toBeInTheDocument();
  });

  it("updates errors-caught when slider moves", async () => {
    renderComponent();
    await screen.findByText("invoiceNumber");
    const slider = screen.getByLabelText(
      /threshold for invoiceNumber/i,
    ) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0" } });
    await waitFor(() => {
      expect(screen.getByText(/0 of 2 real errors/i)).toBeInTheDocument();
    });
  });

  it("snaps slider when 'Catch 90%' chip clicked", async () => {
    renderComponent();
    await screen.findByText("invoiceNumber");
    fireEvent.click(screen.getByRole("button", { name: /catch 90%/i }));
    const slider = screen.getByLabelText(
      /threshold for invoiceNumber/i,
    ) as HTMLInputElement;
    expect(Number(slider.value)).toBeCloseTo(0.5, 2);
  });

  it("renders empty state when notReady", async () => {
    mockUseErrorDetectionAnalysis.mockReturnValue({
      analysis: {
        ...sampleAnalysis,
        notReady: true,
        fields: [],
        excludedFields: [],
      },
      isLoading: false,
      error: null,
    });
    renderComponent();
    expect(
      await screen.findByText(/analysis available once the run completes/i),
    ).toBeInTheDocument();
  });
});
