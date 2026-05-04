import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClassifierModel,
  ClassifierSource,
  ClassifierStatus,
} from "@/shared/types/classifier";
import ClassifierDetails from "./ClassifierDetails";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
const mockUseMyGroups = vi.fn();
const mockUseClassifier = vi.fn();
const mockUseGroup = vi.fn();

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/auth/GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

vi.mock("@/data/hooks/useGroups", () => ({
  useMyGroups: () => mockUseMyGroups(),
}));

vi.mock("@/data/hooks/useClassifier", () => ({
  useClassifier: () => mockUseClassifier(),
}));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const classifier: ClassifierModel = {
  id: "clf-1",
  name: "invoice-classifier",
  group_id: "group-abc",
  status: ClassifierStatus.READY,
  description: "Test",
  source: ClassifierSource.AZURE,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders ClassifierDetails inside required providers.
 */
const renderDetails = (
  overrides: {
    isSystemAdmin?: boolean;
    myGroups?: { id: string; name: string; role: string }[];
    onDeleted?: () => void;
  } = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mockUseAuth.mockReturnValue({
    isSystemAdmin: overrides.isSystemAdmin ?? false,
    user: { sub: "user-1" },
  });
  mockUseMyGroups.mockReturnValue({ data: overrides.myGroups ?? [] });
  mockUseGroup.mockReturnValue({ activeGroup: null });
  mockUseClassifier.mockReturnValue({
    updateClassifier: { mutate: vi.fn(), isPending: false },
    deleteClassifier: { mutate: vi.fn(), isPending: false },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ClassifierDetails
          classifierModel={classifier}
          onDeleted={overrides.onDeleted ?? vi.fn()}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClassifierDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1 – Delete button visibility by role
  // -------------------------------------------------------------------------
  describe("Scenario 1 – Delete button visibility", () => {
    it("does not show Delete button for a regular member", () => {
      renderDetails({
        isSystemAdmin: false,
        myGroups: [{ id: "group-abc", name: "Test", role: "MEMBER" }],
      });
      expect(
        screen.queryByRole("button", { name: /^delete$/i }),
      ).not.toBeInTheDocument();
    });

    it("shows Delete button for a group admin of the classifier's group", () => {
      renderDetails({
        isSystemAdmin: false,
        myGroups: [{ id: "group-abc", name: "Test", role: "ADMIN" }],
      });
      expect(
        screen.getByRole("button", { name: /^delete$/i }),
      ).toBeInTheDocument();
    });

    it("shows Delete button for a system admin", () => {
      renderDetails({ isSystemAdmin: true, myGroups: [] });
      expect(
        screen.getByRole("button", { name: /^delete$/i }),
      ).toBeInTheDocument();
    });

    it("does not show Delete button for admin of a different group", () => {
      renderDetails({
        isSystemAdmin: false,
        myGroups: [{ id: "other-group", name: "Other", role: "ADMIN" }],
      });
      expect(
        screen.queryByRole("button", { name: /^delete$/i }),
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2 – Core fields rendered
  // -------------------------------------------------------------------------
  describe("Scenario 2 – classifier fields rendered", () => {
    it("renders the classifier name", () => {
      renderDetails();
      expect(screen.getByText("invoice-classifier")).toBeInTheDocument();
    });

    it("renders the classifier status", () => {
      renderDetails();
      expect(screen.getByText(ClassifierStatus.READY)).toBeInTheDocument();
    });
  });
});
