import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GroupMember,
  GroupRequest,
  UserGroup,
} from "../data/hooks/useGroups";
import { GroupDetailPage } from "./GroupDetailPage";

const { mockNotificationsShow } = vi.hoisted(() => ({
  mockNotificationsShow: vi.fn(),
}));
vi.mock("@mantine/notifications", () => ({
  notifications: { show: mockNotificationsShow },
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
const mockUseGroup = vi.fn();
const mockUseMyGroups = vi.fn();
const mockUseGroupMembers = vi.fn();
const mockRemoveMutate = vi.fn();
const mockUseRemoveGroupMember = vi.fn();
const mockLeaveMutate = vi.fn();
const mockUseLeaveGroup = vi.fn();
const mockUseGroupRequests = vi.fn();
const mockApproveMutate = vi.fn();
const mockUseApproveMembershipRequest = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("../data/hooks/useGroups", () => ({
  useMyGroups: () => mockUseMyGroups(),
  useGroupMembers: () => mockUseGroupMembers(),
  useRemoveGroupMember: () => mockUseRemoveGroupMember(),
  useLeaveGroup: () => mockUseLeaveGroup(),
  useGroupRequests: () => mockUseGroupRequests(),
  useApproveMembershipRequest: () => mockUseApproveMembershipRequest(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GROUP_ID = "g-1";

const availableGroups = [{ id: GROUP_ID, name: "Alpha Team" }];

const myGroupsMember: UserGroup[] = [
  { id: GROUP_ID, name: "Alpha Team", role: "MEMBER" },
];

const myGroupsAdmin: UserGroup[] = [
  { id: GROUP_ID, name: "Alpha Team", role: "ADMIN" },
];

const members: GroupMember[] = [
  {
    userId: "u-1",
    email: "alice@example.com",
    joinedAt: "2026-01-10T00:00:00Z",
  },
  { userId: "u-2", email: "bob@example.com", joinedAt: "2026-02-01T00:00:00Z" },
];

const groupRequests: GroupRequest[] = [
  {
    id: "req-1",
    userId: "u-3",
    email: "charlie@example.com",
    groupId: GROUP_ID,
    status: "PENDING",
    createdAt: "2026-03-01T00:00:00Z",
  },
  {
    id: "req-2",
    userId: "u-4",
    email: "diana@example.com",
    groupId: GROUP_ID,
    status: "APPROVED",
    reason: "Approved",
    createdAt: "2026-02-15T00:00:00Z",
  },
];

const idleRemove = { mutate: mockRemoveMutate, isPending: false };
const idleLeave = { mutate: mockLeaveMutate, isPending: false };
const idleApprove = { mutate: mockApproveMutate, isPending: false };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders GroupDetailPage routed to /groups/:groupId.
 * Includes a /groups route for validating post-leave navigation.
 */
const renderPage = (groupId = GROUP_ID) =>
  render(
    <MemoryRouter initialEntries={[`/groups/${groupId}`]}>
      <MantineProvider>
        <Routes>
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route
            path="/groups"
            element={<div data-testid="groups-list-page" />}
          />
        </Routes>
      </MantineProvider>
    </MemoryRouter>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GroupDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRemoveGroupMember.mockReturnValue(idleRemove);
    mockUseLeaveGroup.mockReturnValue(idleLeave);
    mockUseApproveMembershipRequest.mockReturnValue(idleApprove);
    mockUseGroup.mockReturnValue({ availableGroups });
    mockUseGroupMembers.mockReturnValue({
      data: members,
      isLoading: false,
      isError: false,
    });
    mockUseGroupRequests.mockReturnValue({
      data: groupRequests,
      isLoading: false,
      isError: false,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – Members tab NOT shown to non-members
  // -------------------------------------------------------------------------
  describe("Scenario 1 – Members tab not shown to non-members", () => {
    it("does not render the Members tab when user has no group membership", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-99", groups: [] },
        isSystemAdmin: false,
      });
      mockUseGroup.mockReturnValue({ availableGroups: [] });
      mockUseMyGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(
        screen.queryByRole("tab", { name: "Members" }),
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – Members tab shown to group members
  // -------------------------------------------------------------------------
  describe("Scenario 2 – Members tab shown to members", () => {
    it("renders the Members tab for a regular group member", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument();
    });

    it("renders the Members tab for a group admin", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsAdmin,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument();
    });

    it("renders the Members tab for a system admin", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "admin-1", groups: [] },
        isSystemAdmin: true,
      });
      mockUseMyGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument();
    });

    it("displays member email and joined date columns", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });

      renderPage();

      const table = screen.getByTestId("members-table");
      expect(
        within(table).getByRole("columnheader", { name: "Email" }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole("columnheader", { name: "Joined" }),
      ).toBeInTheDocument();
      expect(within(table).getByText("alice@example.com")).toBeInTheDocument();
      expect(within(table).getByText("bob@example.com")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – Non-admin members do NOT see the Remove button
  // -------------------------------------------------------------------------
  describe("Scenario 3 – Regular member does not see Remove button", () => {
    it("does not render the Actions column or Remove button for a regular member", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(
        screen.queryByRole("columnheader", { name: "Actions" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /remove/i }),
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – Group admin / system admin see the Remove button
  // -------------------------------------------------------------------------
  describe("Scenario 4 – Admin sees Remove button per row", () => {
    it("renders a Remove button for each member when user is a group admin", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsAdmin,
        isLoading: false,
        isError: false,
      });

      renderPage();

      const removeButtons = screen.getAllByRole("button", { name: /remove/i });
      expect(removeButtons).toHaveLength(members.length);
    });

    it("renders a Remove button for each member when user is a system admin", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "admin-1", groups: [] },
        isSystemAdmin: true,
      });
      mockUseMyGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      const removeButtons = screen.getAllByRole("button", { name: /remove/i });
      expect(removeButtons).toHaveLength(members.length);
    });

    it("opens confirmation dialog when Remove is clicked (does not immediately mutate)", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsAdmin,
        isLoading: false,
        isError: false,
      });

      renderPage();

      const [firstRemove] = screen.getAllByTestId(/^remove-btn-/);
      fireEvent.click(firstRemove);

      await waitFor(() => {
        expect(screen.getByTestId("remove-confirm-btn")).toBeInTheDocument();
      });

      expect(mockRemoveMutate).not.toHaveBeenCalled();
    });

    it("calls the remove mutation with the correct userId after confirming the dialog", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsAdmin,
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByTestId("remove-btn-u-1"));

      await waitFor(() => {
        expect(screen.getByTestId("remove-confirm-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("remove-confirm-btn"));

      expect(mockRemoveMutate).toHaveBeenCalledWith("u-1", expect.any(Object));
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6 – Confirmation dialog behaviour (US-017)
  // -------------------------------------------------------------------------
  describe("Scenario 6 – Remove confirmation dialog", () => {
    const adminSetup = () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsAdmin,
        isLoading: false,
        isError: false,
      });
    };

    it("displays the member email in the confirmation dialog", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByTestId("remove-btn-u-1"));

      await waitFor(() => {
        expect(screen.getByTestId("remove-confirm-btn")).toBeInTheDocument();
        expect(screen.getByTestId("remove-cancel-btn")).toBeInTheDocument();
        const dialog = screen.getByRole("dialog");
        expect(
          within(dialog).getByText("alice@example.com"),
        ).toBeInTheDocument();
      });
    });

    it("does not call mutation when Cancel is clicked", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByTestId("remove-btn-u-1"));

      await waitFor(() => {
        expect(screen.getByTestId("remove-cancel-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("remove-cancel-btn"));

      expect(mockRemoveMutate).not.toHaveBeenCalled();
    });

    it("shows an error notification when the API call fails", async () => {
      adminSetup();

      let capturedOnError: ((error: Error) => void) | undefined;
      mockRemoveMutate.mockImplementation(
        (_userId: string, callbacks: { onError?: (error: Error) => void }) => {
          capturedOnError = callbacks?.onError;
        },
      );

      renderPage();

      fireEvent.click(screen.getByTestId("remove-btn-u-1"));

      await waitFor(() => {
        expect(screen.getByTestId("remove-confirm-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("remove-confirm-btn"));
      act(() => {
        capturedOnError?.(new Error("API error"));
      });

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5 – Loading and error states
  // -------------------------------------------------------------------------
  describe("Scenario 5 – Loading and error states", () => {
    it("shows a loader while members are loading", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });
      mockUseGroupMembers.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("members-loading")).toBeInTheDocument();
      });
    });

    it("shows an error alert when members fail to load", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1", groups: [{ id: GROUP_ID, name: "Alpha Team" }] },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });
      mockUseGroupMembers.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("members-error")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // US-018 – Leave Group action
  // -------------------------------------------------------------------------
  describe("US-018 – Leave Group action", () => {
    const memberSetup = () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });
    };

    // Scenario 1 – Leave Group button visible to member
    it("shows the Leave Group button when the user is an actual group member", () => {
      memberSetup();
      renderPage();

      expect(screen.getByTestId("leave-group-btn")).toBeInTheDocument();
    });

    it("does not show the Leave Group button when the user is only a system admin (not a roster member)", () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "admin-1" },
        isSystemAdmin: true,
      });
      mockUseGroup.mockReturnValue({ availableGroups: [] });
      mockUseMyGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      expect(screen.queryByTestId("leave-group-btn")).not.toBeInTheDocument();
    });

    // Scenario 2 – Clicking Leave Group opens confirmation dialog
    it("opens the Leave Group confirmation dialog when the button is clicked (no mutation fired)", async () => {
      memberSetup();
      renderPage();

      fireEvent.click(screen.getByTestId("leave-group-btn"));

      await waitFor(() => {
        expect(
          screen.getByTestId("leave-group-confirm-btn"),
        ).toBeInTheDocument();
      });

      expect(mockLeaveMutate).not.toHaveBeenCalled();
    });

    // Scenario 3 – Confirming leaves the group and redirects
    it("calls the leave mutation when the user confirms, then redirects to /groups on success", async () => {
      memberSetup();

      mockLeaveMutate.mockImplementation(
        (_arg: undefined, callbacks: { onSuccess?: () => void }) => {
          callbacks?.onSuccess?.();
        },
      );

      renderPage();

      fireEvent.click(screen.getByTestId("leave-group-btn"));

      await waitFor(() => {
        expect(
          screen.getByTestId("leave-group-confirm-btn"),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("leave-group-confirm-btn"));

      expect(mockLeaveMutate).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByTestId("groups-list-page")).toBeInTheDocument();
      });
    });

    // Scenario 4 – Cancelling the dialog does nothing
    it("does not call the leave mutation when the user cancels", async () => {
      memberSetup();
      renderPage();

      fireEvent.click(screen.getByTestId("leave-group-btn"));

      await waitFor(() => {
        expect(
          screen.getByTestId("leave-group-cancel-btn"),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("leave-group-cancel-btn"));

      expect(mockLeaveMutate).not.toHaveBeenCalled();
    });

    it("shows an error notification when the leave API call fails", async () => {
      memberSetup();

      let capturedOnError: ((error: Error) => void) | undefined;
      mockLeaveMutate.mockImplementation(
        (_arg: undefined, callbacks: { onError?: (error: Error) => void }) => {
          capturedOnError = callbacks?.onError;
        },
      );

      renderPage();

      fireEvent.click(screen.getByTestId("leave-group-btn"));

      await waitFor(() => {
        expect(
          screen.getByTestId("leave-group-confirm-btn"),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("leave-group-confirm-btn"));
      act(() => {
        capturedOnError?.(new Error("API error"));
      });

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // US-019 – Membership Requests tab
  // -------------------------------------------------------------------------
  describe("US-019 – Membership Requests tab", () => {
    const adminSetup = () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsAdmin,
        isLoading: false,
        isError: false,
      });
    };

    const memberSetup = () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });
    };

    const sysAdminSetup = () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "admin-1" },
        isSystemAdmin: true,
      });
      mockUseMyGroups.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });
    };

    // Scenario 1 – Tab not visible to regular members
    it("does not show the Membership Requests tab for a regular group member", () => {
      memberSetup();
      renderPage();

      expect(
        screen.queryByRole("tab", { name: "Membership Requests" }),
      ).not.toBeInTheDocument();
    });

    // Scenario 2 – Tab visible to group admins
    it("shows the Membership Requests tab for a group admin", () => {
      adminSetup();
      renderPage();

      expect(
        screen.getByRole("tab", { name: "Membership Requests" }),
      ).toBeInTheDocument();
    });

    it("shows the Membership Requests tab for a system admin", () => {
      sysAdminSetup();
      mockUseGroup.mockReturnValue({ availableGroups: [] });
      renderPage();

      expect(
        screen.getByRole("tab", { name: "Membership Requests" }),
      ).toBeInTheDocument();
    });

    // Scenario 2 – Table columns and data displayed
    it("displays the requests table with correct columns when the tab is active", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        const table = screen.getByTestId("requests-table");
        expect(
          within(table).getByRole("columnheader", { name: "Email" }),
        ).toBeInTheDocument();
        expect(
          within(table).getByRole("columnheader", { name: "Requested" }),
        ).toBeInTheDocument();
        expect(
          within(table).getByRole("columnheader", { name: "Reason" }),
        ).toBeInTheDocument();
        expect(
          within(table).getByRole("columnheader", { name: "Status" }),
        ).toBeInTheDocument();
        expect(
          within(table).getByRole("columnheader", { name: "Actions" }),
        ).toBeInTheDocument();
        expect(
          within(table).getByText("charlie@example.com"),
        ).toBeInTheDocument();
        expect(
          within(table).getByText("diana@example.com"),
        ).toBeInTheDocument();
      });
    });

    // Scenario 3 – Status filter defaults to PENDING
    it("renders the status filter with PENDING as the default value", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(screen.getByTestId("requests-status-filter")).toBeInTheDocument();
        // Mantine Select renders a visible input with the label of the selected option
        const inputs = screen.getAllByDisplayValue("Pending");
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    // Scenario 5 – Loading state
    it("shows a loader while requests are loading", async () => {
      adminSetup();
      mockUseGroupRequests.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(screen.getByTestId("requests-loading")).toBeInTheDocument();
      });
    });

    // Scenario 5 – Error state
    it("shows an error alert when requests fail to load", async () => {
      adminSetup();
      mockUseGroupRequests.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(screen.getByTestId("requests-error")).toBeInTheDocument();
      });
    });

    // Empty state
    it("shows an empty state when there are no requests", async () => {
      adminSetup();
      mockUseGroupRequests.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(screen.getByTestId("requests-empty")).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // US-020 – Approve Membership Request Action
  // -------------------------------------------------------------------------
  describe("US-020 – Approve Membership Request Action", () => {
    const adminSetup = () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsAdmin,
        isLoading: false,
        isError: false,
      });
    };

    // Scenario 3 – Approve button only visible on PENDING rows
    it("shows the Approve button only on PENDING rows", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        // req-1 is PENDING — should have Approve button
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
        // req-2 is APPROVED — should NOT have Approve button
        expect(
          screen.queryByTestId(`approve-btn-${groupRequests[1].id}`),
        ).not.toBeInTheDocument();
      });
    });

    it("does not show Approve buttons when user is not an admin", async () => {
      mockUseAuth.mockReturnValue({
        user: { sub: "u-1" },
        isSystemAdmin: false,
      });
      mockUseMyGroups.mockReturnValue({
        data: myGroupsMember,
        isLoading: false,
        isError: false,
      });

      renderPage();

      // Regular member does not see the Requests tab, but check just in case
      expect(
        screen.queryByRole("tab", { name: "Membership Requests" }),
      ).not.toBeInTheDocument();
    });

    // Scenario 1 – Clicking Approve opens the modal (no immediate mutation)
    it("opens the approve modal when the Approve button is clicked without calling the mutation", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
      );

      await waitFor(() => {
        expect(screen.getByTestId("approve-confirm-btn")).toBeInTheDocument();
      });

      expect(mockApproveMutate).not.toHaveBeenCalled();
    });

    // Scenario 2 – Optional reason field is shown in the modal
    it("shows a reason input inside the approve modal", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
      );

      await waitFor(() => {
        expect(
          screen.getByTestId("approve-reason-input"),
        ).toBeInTheDocument();
      });
    });

    // Scenario 1 (continued) – Confirming calls the approve mutation
    it("calls the approve mutation with the correct requestId when confirmed", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
      );

      await waitFor(() => {
        expect(screen.getByTestId("approve-confirm-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("approve-confirm-btn"));

      expect(mockApproveMutate).toHaveBeenCalledWith(
        { requestId: groupRequests[0].id, reason: undefined },
        expect.any(Object),
      );
    });

    // After approval, active tab switches back to Members
    it("switches to the Members tab and shows members after successful approval", async () => {
      adminSetup();

      mockApproveMutate.mockImplementation(
        (
          _payload: { requestId: string; reason?: string },
          callbacks: { onSuccess?: () => void },
        ) => {
          callbacks?.onSuccess?.();
        },
      );

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
      );

      await waitFor(() => {
        expect(screen.getByTestId("approve-confirm-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("approve-confirm-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("members-table")).toBeInTheDocument();
      });
    });

    // Scenario 2 – Reason is passed when provided
    it("passes the typed reason to the mutation when provided", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
      );

      await waitFor(() => {
        expect(
          screen.getByTestId("approve-reason-input"),
        ).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("approve-reason-input"), {
        target: { value: "Looks good" },
      });

      fireEvent.click(screen.getByTestId("approve-confirm-btn"));

      expect(mockApproveMutate).toHaveBeenCalledWith(
        { requestId: groupRequests[0].id, reason: "Looks good" },
        expect.any(Object),
      );
    });

    // Cancel button closes modal without mutating
    it("does not call the mutation when Cancel is clicked in the approve modal", async () => {
      adminSetup();
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
      );

      await waitFor(() => {
        expect(screen.getByTestId("approve-cancel-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("approve-cancel-btn"));

      expect(mockApproveMutate).not.toHaveBeenCalled();
    });

    // Scenario 4 – Error notification shown on API failure
    it("shows an error notification when the approve API call fails", async () => {
      adminSetup();

      let capturedOnError: ((error: Error) => void) | undefined;
      mockApproveMutate.mockImplementation(
        (
          _payload: { requestId: string; reason?: string },
          callbacks: { onError?: (error: Error) => void },
        ) => {
          capturedOnError = callbacks?.onError;
        },
      );

      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "Membership Requests" }));

      await waitFor(() => {
        expect(
          screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`approve-btn-${groupRequests[0].id}`),
      );

      await waitFor(() => {
        expect(screen.getByTestId("approve-confirm-btn")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("approve-confirm-btn"));

      act(() => {
        capturedOnError?.(new Error("API error"));
      });

      expect(mockNotificationsShow).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red" }),
      );
    });
  });
});
