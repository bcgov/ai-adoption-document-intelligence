import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../auth/AuthContext";
import ClassifierPage from "./ClassifierPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();
const mockUseClassifier = vi.fn();

vi.mock("../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../data/hooks/useClassifier", () => ({
  useClassifier: () => mockUseClassifier(),
}));

vi.mock("../components/classification/ClassifierDetails", () => ({
  default: () => <div>ClassifierDetails</div>,
}));

vi.mock("../components/classification/ClassificationFiles", () => ({
  default: () => <div>ClassificationFiles</div>,
}));

vi.mock("../components/classification/ClassifierAccess", () => ({
  default: () => <div>ClassifierAccess</div>,
}));

vi.mock("../components/classification/ClassifierModals", () => ({
  CreateClassifierModal: () => <div>CreateClassifierModal</div>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup: Group = { id: "group-abc", name: "Test Group" };

const classifiers = [
  {
    id: "clf-1",
    name: "Invoice Classifier",
    group_id: "group-abc",
    description: "",
    status: "ready",
  },
  {
    id: "clf-2",
    name: "Receipt Classifier",
    group_id: "group-xyz",
    description: "",
    status: "ready",
  },
];

/**
 * Renders ClassifierPage inside required providers.
 */
const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ClassifierPage />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClassifierPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClassifier.mockReturnValue({
      getClassifiers: {
        data: classifiers,
        isLoading: false,
        refetch: vi.fn(),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – "Create new model" button is disabled when activeGroup is null
  // -------------------------------------------------------------------------
  describe("Scenario 2 – Create new model button disabled with no active group", () => {
    it("disables the Create new model button when activeGroup is null", () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", { name: /create new model/i });
      expect(button).toBeDisabled();
    });

    it("enables the Create new model button when an activeGroup is set", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderPage();

      const button = screen.getByRole("button", { name: /create new model/i });
      expect(button).not.toBeDisabled();
    });

    it("shows a tooltip explaining a group must be selected when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", { name: /create new model/i });
      const tooltipAnchor = button.parentElement;
      if (tooltipAnchor) {
        fireEvent.mouseEnter(tooltipAnchor);
      }

      await waitFor(() => {
        expect(
          screen.getByText(/a group must be selected to create a model/i),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – classifier labels do not reference hardcoded group names
  // -------------------------------------------------------------------------
  describe("Scenario 4 – classifier labels use model name only", () => {
    it("renders classifier options using only the model name", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderPage();

      // Open the select dropdown to view options
      fireEvent.click(screen.getByPlaceholderText(/choose a model/i));

      await waitFor(() => {
        expect(screen.getByText("Invoice Classifier")).toBeInTheDocument();
        expect(screen.getByText("Receipt Classifier")).toBeInTheDocument();
      });
    });

    it("does not show hardcoded group names in classifier option labels", async () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderPage();

      fireEvent.click(screen.getByPlaceholderText(/choose a model/i));

      await waitFor(() => {
        // Hardcoded group names from the old groupOptions constant
        expect(screen.queryByText(/\(Group 1\)/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/\(Group 2\)/i)).not.toBeInTheDocument();
      });
    });
  });
});
