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
import type { GroupMember, UserGroup } from "../data/hooks/useGroups";
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

const idleRemove = { mutate: mockRemoveMutate, isPending: false };
const idleLeave = { mutate: mockLeaveMutate, isPending: false };

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
    mockUseGroup.mockReturnValue({ availableGroups });
    mockUseGroupMembers.mockReturnValue({
      data: members,
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
});
