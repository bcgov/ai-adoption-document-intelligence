import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityNode } from "../../types/graph-workflow";
import { AzureClassifySubmitForm } from "./AzureClassifySubmitForm";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();
const mockUseClassifier = vi.fn();

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../../data/hooks/useClassifier", () => ({
  useClassifier: () => mockUseClassifier(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const activeGroup = { id: "atestgroup", name: "Test Group" };

const readyClassifier = {
  id: "c-1",
  name: "invoice-classifier",
  group_id: "atestgroup",
  status: "READY" as const,
  source: "AZURE" as const,
};

const trainingClassifier = {
  id: "c-2",
  name: "draft-classifier",
  group_id: "atestgroup",
  status: "TRAINING" as const,
  source: "AZURE" as const,
};

const baseNode: ActivityNode = {
  id: "node-1",
  label: "Classify",
  type: "activity",
  activityType: "azureClassify.submit",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderForm = (node: ActivityNode = baseNode, onChange = vi.fn()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    onChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <AzureClassifySubmitForm node={node} onChange={onChange} />
        </MantineProvider>
      </QueryClientProvider>,
    ),
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AzureClassifySubmitForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGroup.mockReturnValue({ activeGroup });
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Classifier dropdown shows only READY classifiers
  // -------------------------------------------------------------------------
  describe("Scenario 1: Classifier dropdown shows only READY classifiers", () => {
    it("lists only classifiers with status READY", async () => {
      mockUseClassifier.mockReturnValue({
        getClassifiers: {
          data: [readyClassifier, trainingClassifier],
          isLoading: false,
          isError: false,
        },
      });

      renderForm();

      // Open the select
      fireEvent.click(screen.getByRole("textbox", { name: /classifier/i }));

      expect(screen.getByText("invoice-classifier")).toBeInTheDocument();
      expect(screen.queryByText("draft-classifier")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Loading state
  // -------------------------------------------------------------------------
  describe("Scenario 2: Loading state", () => {
    it("disables the dropdown while classifiers are loading", () => {
      mockUseClassifier.mockReturnValue({
        getClassifiers: {
          data: undefined,
          isLoading: true,
          isError: false,
        },
      });

      renderForm();

      const select = screen.getByRole("textbox", { name: /classifier/i });
      expect(select).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Error state
  // -------------------------------------------------------------------------
  describe("Scenario 3: Error state", () => {
    it("shows an error message and disables dropdown when fetch fails", () => {
      mockUseClassifier.mockReturnValue({
        getClassifiers: {
          data: undefined,
          isLoading: false,
          isError: true,
        },
      });

      renderForm();

      expect(
        screen.getByText(/Failed to load classifiers/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: /classifier/i }),
      ).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Classifier selection updates node parameters
  // -------------------------------------------------------------------------
  describe("Scenario 4: Classifier selection updates node parameters", () => {
    it("calls onChange with classifierName set in node.parameters", async () => {
      mockUseClassifier.mockReturnValue({
        getClassifiers: {
          data: [readyClassifier],
          isLoading: false,
          isError: false,
        },
      });

      const onChange = vi.fn();
      renderForm(baseNode, onChange);

      // Open the select and click the option
      fireEvent.click(screen.getByRole("textbox", { name: /classifier/i }));
      fireEvent.click(screen.getByText("invoice-classifier"));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            classifierName: "invoice-classifier",
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: No group selected
  // -------------------------------------------------------------------------
  describe("Scenario 5: No active group", () => {
    it("disables the dropdown and shows a warning when no group is active", () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });
      mockUseClassifier.mockReturnValue({
        getClassifiers: {
          data: [],
          isLoading: false,
          isError: false,
        },
      });

      renderForm();

      expect(screen.getByText(/No group selected/i)).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: /classifier/i }),
      ).toBeDisabled();
    });
  });
});
