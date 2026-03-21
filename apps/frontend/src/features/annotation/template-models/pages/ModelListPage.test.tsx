import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "@/auth/AuthContext";
import { ModelListPage } from "./ModelListPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();
const mockUseTemplateModels = vi.fn();

vi.mock("@/auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../hooks/useTemplateModels", () => ({
  useTemplateModels: () => mockUseTemplateModels(),
}));

vi.mock("../components/ModelCard", () => ({
  ModelCard: ({ model }: { model: { name: string } }) => (
    <div>{model.name}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup: Group = { id: "group-1", name: "Group One" };

/**
 * Renders ModelListPage inside required providers.
 */
const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MantineProvider>
          <ModelListPage />
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ModelListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTemplateModels.mockReturnValue({
      templateModels: [],
      isLoading: false,
      createTemplateModel: vi.fn(),
      createTemplateModelAsync: vi.fn(),
      isCreating: false,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 - buttons disabled when no active group
  // -------------------------------------------------------------------------
  describe("Scenario 3 - buttons disabled when activeGroup is null", () => {
    it("disables the New Template Model button when activeGroup is null", () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", {
        name: /new template model/i,
      });
      expect(button).toBeDisabled();
    });

    it("enables the New Template Model button when activeGroup is set", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderPage();

      const button = screen.getByRole("button", {
        name: /new template model/i,
      });
      expect(button).not.toBeDisabled();
    });

    it("shows a tooltip with group instruction on New Template Model button when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", {
        name: /new template model/i,
      });
      const tooltipAnchor = button.parentElement;
      if (tooltipAnchor) {
        fireEvent.mouseEnter(tooltipAnchor);
      }

      await waitFor(() => {
        expect(
          screen.getByText(
            /a group must be selected to create a template model/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it("disables the Create Template Model empty-state button when activeGroup is null", () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", {
        name: /create template model/i,
      });
      expect(button).toBeDisabled();
    });

    it("enables the Create Template Model empty-state button when activeGroup is set", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderPage();

      const button = screen.getByRole("button", {
        name: /create template model/i,
      });
      expect(button).not.toBeDisabled();
    });

    it("shows a tooltip with group instruction on Create Template Model button when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", {
        name: /create template model/i,
      });
      const tooltipAnchor = button.parentElement;
      if (tooltipAnchor) {
        fireEvent.mouseEnter(tooltipAnchor);
      }

      await waitFor(() => {
        expect(
          screen.getAllByText(
            /a group must be selected to create a template model/i,
          ).length,
        ).toBeGreaterThan(0);
      });
    });
  });
});
