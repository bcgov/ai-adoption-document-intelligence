import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "@/auth/AuthContext";
import { ProjectListPage } from "./ProjectListPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseGroup = vi.fn();
const mockUseProjects = vi.fn();

vi.mock("@/auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../hooks/useProjects", () => ({
  useProjects: () => mockUseProjects(),
}));

vi.mock("../components/ProjectCard", () => ({
  ProjectCard: ({ project }: { project: { name: string } }) => (
    <div>{project.name}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeGroup: Group = { id: "group-1", name: "Group One" };

/**
 * Renders ProjectListPage inside required providers.
 */
const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ProjectListPage />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProjectListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjects.mockReturnValue({
      projects: [],
      isLoading: false,
      createProject: vi.fn(),
      createProjectAsync: vi.fn(),
      isCreating: false,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – "New Project" and "Create Project" buttons disabled when no active group
  // -------------------------------------------------------------------------
  describe("Scenario 3 – buttons disabled when activeGroup is null", () => {
    it("disables the New Project button when activeGroup is null", () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", { name: /new project/i });
      expect(button).toBeDisabled();
    });

    it("enables the New Project button when activeGroup is set", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderPage();

      const button = screen.getByRole("button", { name: /new project/i });
      expect(button).not.toBeDisabled();
    });

    it("shows a tooltip with group instruction on New Project button when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", { name: /new project/i });
      const tooltipAnchor = button.parentElement;
      if (tooltipAnchor) {
        fireEvent.mouseEnter(tooltipAnchor);
      }

      await waitFor(() => {
        expect(
          screen.getByText(/a group must be selected to create a project/i),
        ).toBeInTheDocument();
      });
    });

    it("disables the Create Project empty-state button when activeGroup is null", () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", { name: /create project/i });
      expect(button).toBeDisabled();
    });

    it("enables the Create Project empty-state button when activeGroup is set", () => {
      mockUseGroup.mockReturnValue({ activeGroup });

      renderPage();

      const button = screen.getByRole("button", { name: /create project/i });
      expect(button).not.toBeDisabled();
    });

    it("shows a tooltip with group instruction on Create Project button when activeGroup is null", async () => {
      mockUseGroup.mockReturnValue({ activeGroup: null });

      renderPage();

      const button = screen.getByRole("button", { name: /create project/i });
      const tooltipAnchor = button.parentElement;
      if (tooltipAnchor) {
        fireEvent.mouseEnter(tooltipAnchor);
      }

      await waitFor(() => {
        expect(
          screen.getAllByText(/a group must be selected to create a project/i)
            .length,
        ).toBeGreaterThan(0);
      });
    });
  });
});
