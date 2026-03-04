import { MantineProvider } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupRequest } from "../../data/hooks/useGroups";
import { RequestsTab } from "./RequestsTab";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApproveMutate = vi.fn();
const mockDenyMutate = vi.fn();
const mockUseGroupRequests = vi.fn();
const mockUseApproveMembershipRequest = vi.fn();
const mockUseDenyMembershipRequest = vi.fn();

vi.mock("../../data/hooks/useGroups", () => ({
  useGroupRequests: () => mockUseGroupRequests(),
  useApproveMembershipRequest: () => mockUseApproveMembershipRequest(),
  useDenyMembershipRequest: () => mockUseDenyMembershipRequest(),
}));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opens the deny modal for the given request and waits for the modal content to appear.
 * Mantine modals use transitions, so we wait for modal content asynchronously.
 *
 * @param requestId - The ID of the request whose Deny button to click.
 * @returns A promise that resolves to the confirm button element once the modal is open.
 */
const openDenyModal = async (requestId: string) => {
  fireEvent.click(screen.getByTestId(`deny-btn-${requestId}`));
  return screen.findByTestId("deny-confirm-btn");
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const pendingRequest: GroupRequest = {
  id: "req-1",
  userId: "user-1",
  email: "alice@example.com",
  groupId: "group-1",
  status: "PENDING",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const approvedRequest: GroupRequest = {
  id: "req-2",
  userId: "user-2",
  email: "bob@example.com",
  groupId: "group-1",
  status: "APPROVED",
  createdAt: "2024-01-02T00:00:00.000Z",
};

const deniedRequest: GroupRequest = {
  id: "req-3",
  userId: "user-3",
  email: "carol@example.com",
  groupId: "group-1",
  status: "DENIED",
  createdAt: "2024-01-03T00:00:00.000Z",
};

/** Default idle mutation state. */
const idleMutation = (mutate: ReturnType<typeof vi.fn>) => ({
  mutate,
  isPending: false,
});

/**
 * Renders RequestsTab inside a MantineProvider to satisfy Mantine's context requirements.
 *
 * @param isAdmin - Whether the current user is a group or system admin.
 */
const renderTab = (isAdmin = true) =>
  render(
    <MantineProvider>
      <RequestsTab groupId="group-1" isAdmin={isAdmin} />
    </MantineProvider>,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RequestsTab – Deny action (US-021)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApproveMembershipRequest.mockReturnValue(
      idleMutation(mockApproveMutate),
    );
    mockUseDenyMembershipRequest.mockReturnValue(idleMutation(mockDenyMutate));
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – Clicking Deny opens a confirmation dialog
  // -------------------------------------------------------------------------
  describe("Scenario 1 – Clicking Deny opens a confirmation dialog", () => {
    it("opens the deny modal when the Deny button is clicked", async () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);

      expect(screen.getByTestId("deny-confirm-btn")).toBeInTheDocument();
    });

    it("shows an optional reason textarea inside the deny modal", async () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);

      expect(screen.getByTestId("deny-reason-input")).toBeInTheDocument();
    });

    it("shows the requester's email inside the deny modal", async () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);

      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByText(pendingRequest.email, { exact: false }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – Confirming the dialog denies the request
  // -------------------------------------------------------------------------
  describe("Scenario 2 – Confirming the dialog calls the deny mutation", () => {
    it("calls the deny mutation with the requestId and no reason when reason is blank", async () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);
      fireEvent.click(screen.getByTestId("deny-confirm-btn"));

      expect(mockDenyMutate).toHaveBeenCalledWith(
        { requestId: pendingRequest.id, reason: undefined },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });

    it("calls the deny mutation with the provided reason", async () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);

      fireEvent.change(screen.getByTestId("deny-reason-input"), {
        target: { value: "Not eligible" },
      });

      fireEvent.click(screen.getByTestId("deny-confirm-btn"));

      expect(mockDenyMutate).toHaveBeenCalledWith(
        { requestId: pendingRequest.id, reason: "Not eligible" },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });

    it("closes the modal on successful denial", async () => {
      mockUseDenyMembershipRequest.mockReturnValue({
        mutate: (_payload: unknown, { onSuccess }: { onSuccess: () => void }) =>
          onSuccess(),
        isPending: false,
      });

      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);
      fireEvent.click(screen.getByTestId("deny-confirm-btn"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("deny-confirm-btn"),
        ).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3 – Cancelling the dialog does nothing
  // -------------------------------------------------------------------------
  describe("Scenario 3 – Cancelling the dialog does not call the API", () => {
    it("closes the modal when Cancel is clicked without calling the mutation", async () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);

      expect(screen.getByTestId("deny-confirm-btn")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("deny-cancel-btn"));

      expect(mockDenyMutate).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(
          screen.queryByTestId("deny-confirm-btn"),
        ).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4 – Deny button only on PENDING rows
  // -------------------------------------------------------------------------
  describe("Scenario 4 – Deny button is only shown on PENDING rows", () => {
    it("shows the Deny button for a PENDING request when admin", () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab(true);

      expect(
        screen.getByTestId(`deny-btn-${pendingRequest.id}`),
      ).toBeInTheDocument();
    });

    it("does not show the Deny button for an APPROVED request", () => {
      mockUseGroupRequests.mockReturnValue({
        data: [approvedRequest],
        isLoading: false,
        isError: false,
      });

      renderTab(true);

      expect(
        screen.queryByTestId(`deny-btn-${approvedRequest.id}`),
      ).not.toBeInTheDocument();
    });

    it("does not show the Deny button for a DENIED request", () => {
      mockUseGroupRequests.mockReturnValue({
        data: [deniedRequest],
        isLoading: false,
        isError: false,
      });

      renderTab(true);

      expect(
        screen.queryByTestId(`deny-btn-${deniedRequest.id}`),
      ).not.toBeInTheDocument();
    });

    it("does not show the Deny button when the user is not an admin", () => {
      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab(false);

      expect(
        screen.queryByTestId(`deny-btn-${pendingRequest.id}`),
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5 – Error notification on API failure
  // -------------------------------------------------------------------------
  describe("Scenario 5 – Error notification shown on API failure", () => {
    it("shows an error notification when the deny mutation fails", async () => {
      mockUseDenyMembershipRequest.mockReturnValue({
        mutate: (_payload: unknown, { onError }: { onError: () => void }) =>
          onError(),
        isPending: false,
      });

      mockUseGroupRequests.mockReturnValue({
        data: [pendingRequest],
        isLoading: false,
        isError: false,
      });

      renderTab();

      await openDenyModal(pendingRequest.id);
      fireEvent.click(screen.getByTestId("deny-confirm-btn"));

      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red" }),
      );
    });
  });
});
