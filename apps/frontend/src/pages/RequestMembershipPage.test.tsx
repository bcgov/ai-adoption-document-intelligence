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
const mockUseMyRequests = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../data/hooks/useGroups", () => ({
  useAllGroups: () => mockUseAllGroups(),
  useRequestMembership: () => mockUseRequestMembership(),
  useMyRequests: () => mockUseMyRequests(),
}));

vi.mock("../data/hooks/useBootstrap", () => ({
  useBootstrapStatus: () => ({
    data: { needed: false, eligible: false },
    isLoading: false,
  }),
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
    mockUseMyRequests.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – Page lists all available groups
  // -------------------------------------------------------------------------
  describe("Scenario 1 – Page lists all available groups", () => {
    it("renders a row for each group returned by the API", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("groups-search")).toBeInTheDocument();
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
  // Search / filter
  // -------------------------------------------------------------------------
  describe("Search input", () => {
    it("renders the search input when groups are loaded", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("groups-search")).toBeInTheDocument();
    });

    it("hides groups that do not match the search term", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.change(screen.getByTestId("groups-search"), {
        target: { value: "Alpha" },
      });

      expect(screen.getByText("Group Alpha")).toBeInTheDocument();
      expect(screen.queryByText("Group Beta")).not.toBeInTheDocument();
    });

    it("shows no rows when the search term produces no results", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.change(screen.getByTestId("groups-search"), {
        target: { value: "zzznomatch" },
      });

      expect(screen.queryByText("Group Alpha")).not.toBeInTheDocument();
      expect(screen.queryByText("Group Beta")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – User can submit a membership request
  // -------------------------------------------------------------------------
  describe("Scenario 2 – User can submit a membership request", () => {
    it("renders a join button for each group row", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("join-btn-group-a")).toBeInTheDocument();
      expect(screen.getByTestId("join-btn-group-b")).toBeInTheDocument();
    });

    it("calls mutate with the correct groupId when the join button is clicked", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByTestId("join-btn-group-a"));

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

    it("shows 'Request Pending' and disables the button for the joined group", () => {
      mockUseAllGroups.mockReturnValue({
        data: groups,
        isLoading: false,
        isError: false,
      });
      mockUseRequestMembership.mockReturnValue({
        ...idleMutation(),
        isSuccess: true,
      });
      // Simulate the cache having been updated with the new pending request
      mockUseMyRequests.mockReturnValue({
        data: [
          {
            id: "req-1",
            groupId: "group-a",
            groupName: "Group Alpha",
            status: "PENDING",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        isLoading: false,
        isError: false,
      });

      renderPage();

      // group-a button is disabled and shows "Request Pending"
      expect(screen.getByTestId("join-btn-group-a")).toBeDisabled();
      expect(screen.getByTestId("join-btn-group-a")).toHaveTextContent(
        "Request Pending",
      );
      // group-b button is still joinable
      expect(screen.getByTestId("join-btn-group-b")).not.toBeDisabled();
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
