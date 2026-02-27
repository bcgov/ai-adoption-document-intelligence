import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupInfo } from "../data/hooks/useGroups";
import { RequestMembershipPage } from "./RequestMembershipPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
const mockUseAllGroups = vi.fn();
const mockMutate = vi.fn();
const mockUseRequestMembership = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../data/hooks/useGroups", () => ({
  useAllGroups: () => mockUseAllGroups(),
  useRequestMembership: () => mockUseRequestMembership(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const groups: GroupInfo[] = [
  { id: "group-a", name: "Group Alpha" },
  { id: "group-b", name: "Group Beta" },
];

/** Default (idle) mutation state returned by useRequestMembership. */
const idleMutation = () => ({
  mutate: mockMutate,
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null,
});

/**
 * Renders the component inside a MantineProvider to satisfy Mantine's context.
 */
const renderPage = () =>
  render(
    <MantineProvider>
      <RequestMembershipPage />
    </MantineProvider>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RequestMembershipPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ logout: vi.fn() });
    mockUseRequestMembership.mockReturnValue(idleMutation());
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – Page lists all available groups
  // -------------------------------------------------------------------------
  describe("Scenario 1 – Page lists all available groups", () => {
    it("renders a table row for each group returned by the API", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("groups-table")).toBeInTheDocument();
      expect(screen.getByText("Group Alpha")).toBeInTheDocument();
      expect(screen.getByText("Group Beta")).toBeInTheDocument();
    });

    it("shows the loader while groups are being fetched", () => {
      mockUseAllGroups.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("groups-loader")).toBeInTheDocument();
    });

    it("shows an error alert when the groups request fails", () => {
      mockUseAllGroups.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      });

      renderPage();

      expect(screen.getByTestId("groups-error")).toBeInTheDocument();
    });

    it("shows a 'no groups available' message when the API returns an empty list", () => {
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("no-groups-message")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------
  describe("Filter input", () => {
    it("renders the filter input when groups are loaded", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("group-filter")).toBeInTheDocument();
    });

    it("hides groups that do not match the filter", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.change(screen.getByTestId("group-filter"), {
        target: { value: "Alpha" },
      });

      expect(screen.getByText("Group Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Group Beta")).not.toBeInTheDocument();
    });

    it("shows the no-match message when the filter produces no results", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.change(screen.getByTestId("group-filter"), {
        target: { value: "zzznomatch" },
      });

      expect(screen.getByTestId("no-groups-message")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – User can submit a membership request
  // -------------------------------------------------------------------------
  describe("Scenario 2 – User can submit a membership request", () => {
    it("renders a request button for each group row", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("request-button-group-a")).toBeInTheDocument();
      expect(screen.getByTestId("request-button-group-b")).toBeInTheDocument();
    });

    it("calls mutate with the correct groupId when the row button is clicked", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByTestId("request-button-group-a"));

      expect(mockMutate).toHaveBeenCalledWith({ groupId: "group-a" });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – Success state shown after submission
  // -------------------------------------------------------------------------
  describe("Scenario 3 – Success state shown after submission", () => {
    it("displays a success alert when the mutation succeeds", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });
      mockUseRequestMembership.mockReturnValue({
        ...idleMutation(),
        isSuccess: true,
      });

      renderPage();

      expect(screen.getByTestId("request-success")).toBeInTheDocument();
    });

    it("disables all row buttons after a successful submission", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });
      mockUseRequestMembership.mockReturnValue({
        ...idleMutation(),
        isSuccess: true,
      });

      renderPage();

      // Both buttons should be disabled (success disables all)
      const buttons = screen.queryAllByRole("button", {
        name: /request access/i,
      });
      for (const btn of buttons) {
        expect(btn).toBeDisabled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – Error state shown on failure
  // -------------------------------------------------------------------------
  describe("Scenario 4 – Error state shown on failure", () => {
    it("displays an error alert when the mutation fails", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });
      mockUseRequestMembership.mockReturnValue({
        ...idleMutation(),
        isError: true,
        error: new Error("Request failed"),
      });

      renderPage();

      expect(screen.getByTestId("request-error")).toBeInTheDocument();
      expect(screen.getByText("Request failed")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Sign out button
  // -------------------------------------------------------------------------
  describe("Sign out button", () => {
    it("renders the sign-out button", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("sign-out-button")).toBeInTheDocument();
    });

    it("calls logout when the sign-out button is clicked", () => {
      const logout = vi.fn();
      mockUseAuth.mockReturnValue({ logout });
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByTestId("sign-out-button"));

      expect(logout).toHaveBeenCalledOnce();
    });
  });
});
