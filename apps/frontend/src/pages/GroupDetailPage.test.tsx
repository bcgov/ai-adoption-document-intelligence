import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupMember, UserGroup } from "../data/hooks/useGroups";
import { GroupDetailPage } from "./GroupDetailPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
const mockUseGroup = vi.fn();
const mockUseMyGroups = vi.fn();
const mockUseGroupMembers = vi.fn();
const mockRemoveMutate = vi.fn();
const mockUseRemoveGroupMember = vi.fn();

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
  { userId: "u-1", email: "alice@example.com", joinedAt: "2026-01-10T00:00:00Z" },
  { userId: "u-2", email: "bob@example.com", joinedAt: "2026-02-01T00:00:00Z" },
];

const idleRemove = { mutate: mockRemoveMutate, isPending: false };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders GroupDetailPage routed to /groups/:groupId.
 */
const renderPage = (groupId = GROUP_ID) =>
  render(
    <MemoryRouter initialEntries={[`/groups/${groupId}`]}>
      <MantineProvider>
        <Routes>
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
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

      expect(screen.queryByRole("tab", { name: "Members" })).not.toBeInTheDocument();
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
      expect(within(table).getByRole("columnheader", { name: "Email" })).toBeInTheDocument();
      expect(within(table).getByRole("columnheader", { name: "Joined" })).toBeInTheDocument();
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

      expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
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

    it("calls the remove mutation with the correct userId when Remove is clicked", () => {
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

      const [firstRemove] = screen.getAllByRole("button", { name: /remove/i });
      fireEvent.click(firstRemove);

      expect(mockRemoveMutate).toHaveBeenCalledWith("u-1");
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
});
