import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupSelector } from "./GroupSelector";

const mockUseGroup = vi.fn();

vi.mock("../../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

const groupAlpha = { id: "alpha", name: "Alpha Team" };
const groupBeta = { id: "beta", name: "Beta Team" };

/**
 * Wraps the component under test in a MantineProvider to satisfy Mantine's context requirements.
 */
const renderWithMantine = (ui: React.ReactNode) =>
  render(<MantineProvider>{ui}</MantineProvider>);

describe("GroupSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1 & 2 – selector visible for authenticated users / lists user groups
  // ---------------------------------------------------------------------------
  describe("Scenario 1 & 2 – selector visible and lists user groups", () => {
    it("renders the group selector combobox when the user has groups", () => {
      mockUseGroup.mockReturnValue({
        availableGroups: [groupAlpha, groupBeta],
        activeGroup: groupAlpha,
        setActiveGroup: vi.fn(),
      });

      renderWithMantine(<GroupSelector />);

      expect(screen.getByTestId("group-selector")).toBeInTheDocument();
    });

    it("does not render the no-groups prompt when the user has groups", () => {
      mockUseGroup.mockReturnValue({
        availableGroups: [groupAlpha, groupBeta],
        activeGroup: groupAlpha,
        setActiveGroup: vi.fn(),
      });

      renderWithMantine(<GroupSelector />);

      expect(screen.queryByTestId("no-groups-link")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3 – currently active group shown as selected value
  // ---------------------------------------------------------------------------
  describe("Scenario 3 – active group shown as selected value", () => {
    it("displays the active group name as the current input value", () => {
      mockUseGroup.mockReturnValue({
        availableGroups: [groupAlpha, groupBeta],
        activeGroup: groupAlpha,
        setActiveGroup: vi.fn(),
      });

      renderWithMantine(<GroupSelector />);

      expect(screen.getByDisplayValue("Alpha Team")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4 – selecting a group updates context
  // ---------------------------------------------------------------------------
  describe("Scenario 4 – selecting a group calls setActiveGroup", () => {
    it("calls setActiveGroup with the correct group when an option is selected", () => {
      const setActiveGroup = vi.fn();
      mockUseGroup.mockReturnValue({
        availableGroups: [groupAlpha, groupBeta],
        activeGroup: groupAlpha,
        setActiveGroup,
      });

      renderWithMantine(<GroupSelector />);

      const input = screen.getByTestId("group-selector");

      fireEvent.click(input);

      const option = screen.getByText("Beta Team");
      fireEvent.click(option);

      expect(setActiveGroup).toHaveBeenCalledWith(groupBeta);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5 – dropdown is searchable
  // ---------------------------------------------------------------------------
  describe("Scenario 5 – dropdown is searchable", () => {
    it("filters options when the user types a search term", () => {
      mockUseGroup.mockReturnValue({
        availableGroups: [groupAlpha, groupBeta],
        activeGroup: groupAlpha,
        setActiveGroup: vi.fn(),
      });

      renderWithMantine(<GroupSelector />);

      const input = screen.getByTestId("group-selector");

      fireEvent.click(input);
      fireEvent.change(input, { target: { value: "Beta" } });

      expect(screen.getByText("Beta Team")).toBeInTheDocument();
      expect(screen.queryByText("Alpha Team")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 6 – empty-groups state shows membership prompt
  // ---------------------------------------------------------------------------
  describe("Scenario 6 – empty-groups state shows membership prompt", () => {
    it("shows the no-groups prompt when availableGroups is empty", () => {
      mockUseGroup.mockReturnValue({
        availableGroups: [],
        activeGroup: null,
        setActiveGroup: vi.fn(),
      });

      renderWithMantine(<GroupSelector />);

      const link = screen.getByTestId("no-groups-link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent("No groups — request membership");
    });

    it("links to /request-membership when the no-groups prompt is shown", () => {
      mockUseGroup.mockReturnValue({
        availableGroups: [],
        activeGroup: null,
        setActiveGroup: vi.fn(),
      });

      renderWithMantine(<GroupSelector />);

      expect(screen.getByTestId("no-groups-link")).toHaveAttribute(
        "href",
        "/request-membership",
      );
    });

    it("does not render the group selector when availableGroups is empty", () => {
      mockUseGroup.mockReturnValue({
        availableGroups: [],
        activeGroup: null,
        setActiveGroup: vi.fn(),
      });

      renderWithMantine(<GroupSelector />);

      expect(screen.queryByTestId("group-selector")).not.toBeInTheDocument();
    });
  });
});
