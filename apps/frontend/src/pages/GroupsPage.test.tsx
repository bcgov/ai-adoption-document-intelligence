import { MantineProvider } from "@mantine/core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GroupInfo,
  MyMembershipRequest,
  UserGroup,
} from "../data/hooks/useGroups";
import { GroupsPage } from "./GroupsPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
const mockUseMyGroups = vi.fn();
const mockUseAllGroups = vi.fn();
const mockUseMyRequests = vi.fn();
const mockMutate = vi.fn();
const mockUseCancelMembershipRequest = vi.fn();
const mockNavigate = vi.fn();

const { mockNotificationsShow } = vi.hoisted(() => ({
  mockNotificationsShow: vi.fn(),
}));
vi.mock("@mantine/notifications", () => ({
  notifications: { show: mockNotificationsShow },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../data/hooks/useGroups", () => ({
  useMyGroups: () => mockUseMyGroups(),
  useAllGroups: () => mockUseAllGroups(),
  useMyRequests: () => mockUseMyRequests(),
  useCancelMembershipRequest: () => mockUseCancelMembershipRequest(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const myGroups: UserGroup[] = [
  { id: "g-1", name: "My Team A", role: "MEMBER" },
  { id: "g-2", name: "My Team B", role: "ADMIN" },
];

const allGroups: GroupInfo[] = [
  { id: "g-1", name: "My Team A" },
  { id: "g-2", name: "My Team B" },
  { id: "g-3", name: "Other Team" },
];

const pendingRequests: MyMembershipRequest[] = [
  {
    id: "req-1",
    groupId: "g-3",
    groupName: "Other Team",
    status: "PENDING",
    createdAt: "2026-01-15T10:00:00Z",
  },
];

const approvedRequests: MyMembershipRequest[] = [
  {
    id: "req-2",
    groupId: "g-1",
    groupName: "My Team A",
    status: "APPROVED",
    reason: "Welcome!",
    createdAt: "2026-01-10T08:00:00Z",
  },
];

const idleCancel = {
  mutate: mockMutate,
  isPending: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders GroupsPage inside MemoryRouter and MantineProvider.
 */
const renderPage = () =>
  render(
    <MemoryRouter>
      <MantineProvider>
        <GroupsPage />
      </MantineProvider>
    </MemoryRouter>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GroupsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationsShow.mockReset();
    mockUseCancelMembershipRequest.mockReturnValue(idleCancel);
    mockUseMyRequests.mockReturnValue({
      data: pendingRequests,
      isLoading: false,
      isError: false,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – Two tabs render
  // -------------------------------------------------------------------------
  describe("Scenario 1 – Page renders with two tabs", () => {
    it("shows the My Groups and My Requests tabs", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(
        screen.getByRole("tab", { name: "My Groups" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "My Requests" }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – Non-admin sees only their own groups
  // -------------------------------------------------------------------------
  describe("Scenario 2 – Non-admin user sees only their groups", () => {
    it("renders only the user's groups in the table", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: allGroups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      const panel = screen.getByRole("tabpanel", { name: "My Groups" });
      expect(within(panel).getByText("My Team A")).toBeInTheDocument();
      expect(within(panel).getByText("My Team B")).toBeInTheDocument();
      // "Other Team" appears in allGroups but not myGroups — should not be shown in this panel
      expect(within(panel).queryByText("Other Team")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – System admin sees all groups
  // -------------------------------------------------------------------------
  describe("Scenario 3 – System admin sees all groups", () => {
    it("renders all groups including those the admin does not belong to", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "admin-1" },
        isSystemAdmin: true,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: allGroups,
        isLoading: false,
        isError: false,
      });

      renderPage();

      const panel = screen.getByRole("tabpanel", { name: "My Groups" });
      expect(within(panel).getByText("My Team A")).toBeInTheDocument();
      expect(within(panel).getByText("My Team B")).toBeInTheDocument();
      expect(within(panel).getByText("Other Team")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – Clicking a group navigates to group detail page
  // -------------------------------------------------------------------------
  describe("Scenario 4 – Clicking a group navigates to /groups/:groupId", () => {
    it("calls navigate with the correct group route when a row is clicked", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByText("My Team A"));

      expect(mockNavigate).toHaveBeenCalledWith("/groups/g-1");
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5 – My Requests tab shows requests table
  // -------------------------------------------------------------------------
  describe("Scenario 5 – My Requests tab displays request data", () => {
    it("shows the requests table with expected columns when the tab is activated", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        const panel = screen.getByRole("tabpanel", { name: "My Requests" });
        expect(
          within(panel).getByRole("columnheader", { name: "Group" }),
        ).toBeInTheDocument();
        expect(
          within(panel).getByRole("columnheader", { name: "Submitted" }),
        ).toBeInTheDocument();
        expect(
          within(panel).getByRole("columnheader", { name: "Status" }),
        ).toBeInTheDocument();
        expect(
          within(panel).getByRole("columnheader", { name: "Reason" }),
        ).toBeInTheDocument();
        expect(
          within(panel).getByRole("columnheader", { name: "Actions" }),
        ).toBeInTheDocument();
      });
    });

    it("displays the request group name, status and date", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        const panel = screen.getByRole("tabpanel", { name: "My Requests" });
        expect(within(panel).getByText("Other Team")).toBeInTheDocument();
        expect(within(panel).getAllByText("PENDING").length).toBeGreaterThan(0);
      });
    });

    it("shows a cancel button only for PENDING requests", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });
      mockUseMyRequests.mockReturnValue({
        data: approvedRequests,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /cancel/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("opens the confirmation dialog when the cancel button is clicked", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /cancel/i }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.getByTestId("cancel-request-confirm-btn"),
        ).toBeInTheDocument();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("calls the cancel mutation when the confirmation dialog is confirmed", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /cancel/i }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.getByTestId("cancel-request-confirm-btn"),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("cancel-request-confirm-btn"));

      expect(mockMutate).toHaveBeenCalledWith("req-1", expect.any(Object));
    });

    it("does not call the cancel mutation when the confirmation dialog is dismissed", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /cancel/i }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.getByTestId("cancel-request-back-btn"),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("cancel-request-back-btn"));

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("shows an error notification when the cancel API call fails", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });
      mockMutate.mockImplementation(
        (_: string, callbacks: { onError?: () => void }) => {
          callbacks?.onError?.();
        },
      );

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /cancel/i }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.getByTestId("cancel-request-confirm-btn"),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("cancel-request-confirm-btn"));

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red" }),
      );
    });

    it("defaults the status filter to PENDING", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        // Mantine Select renders a visible input + a hidden input; ensure at least one has PENDING
        const inputs = screen.getAllByDisplayValue("PENDING");
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it("shows an empty state message when no requests match the filter", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });
      mockUseMyRequests.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(screen.getByTestId("requests-empty")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6 – Loading and error states
  // -------------------------------------------------------------------------
  describe("Scenario 6 – Loading and error states", () => {
    it("shows a loader while My Groups data is loading", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("groups-loading")).toBeInTheDocument();
    });

    it("shows an error alert when My Groups fails to load", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      });
      mockUseAllGroups.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByTestId("groups-error")).toBeInTheDocument();
    });

    it("shows a loader while My Requests data is loading", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });
      mockUseMyRequests.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(screen.getByTestId("requests-loading")).toBeInTheDocument();
      });
    });

    it("shows an error alert when My Requests fails to load", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "user-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroups,
        isLoading: false,
        isError: false,
      });
      mockUseAllGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });
      mockUseMyRequests.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "My Requests" }));

      await waitFor(() => {
        expect(screen.getByTestId("requests-error")).toBeInTheDocument();
      });
    });
  });
});
