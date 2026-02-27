import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipPageGuard, NoGroupGuard } from "./NoGroupGuard";

const mockUseAuth = vi.fn();
const mockUseGroup = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("./GroupContext", () => ({
  useGroup: () => mockUseGroup(),
}));

const groupA = { id: "group-a", name: "Group Alpha" };

/**
 * Renders NoGroupGuard with an initial route inside a MemoryRouter that
 * includes a "/request-membership" sentinel route so we can assert redirects.
 */
function renderGuard(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/request-membership"
          element={<div>request-membership-page</div>}
        />
        <Route
          path="*"
          element={
            <NoGroupGuard>
              <div>protected-content</div>
            </NoGroupGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoGroupGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: User with no groups is redirected
  // ---------------------------------------------------------------------------
  describe("Scenario 1 – user with no groups is redirected", () => {
    it("redirects to /request-membership when user has no groups and is not system-admin", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      renderGuard("/");

      expect(screen.getByText("request-membership-page")).toBeInTheDocument();
      expect(screen.queryByText("protected-content")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Direct URL entry is blocked
  // ---------------------------------------------------------------------------
  describe("Scenario 2 – direct URL entry is blocked", () => {
    it("redirects to /request-membership when user with no groups enters a protected URL directly", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      renderGuard("/some/deep/path");

      expect(screen.getByText("request-membership-page")).toBeInTheDocument();
      expect(screen.queryByText("protected-content")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Guard does not flash during loading
  // ---------------------------------------------------------------------------
  describe("Scenario 3 – guard does not flash during loading", () => {
    it("renders nothing while auth is still loading", () => {
      mockUseAuth.mockReturnValue({ isLoading: true, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      const { container } = renderGuard("/");

      expect(container).toBeEmptyDOMElement();
      expect(
        screen.queryByText("request-membership-page"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("protected-content")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: System-admin is exempt from the guard
  // ---------------------------------------------------------------------------
  describe("Scenario 4 – system-admin is exempt from the guard", () => {
    it("renders protected content for a system-admin with no groups", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: true });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      renderGuard("/");

      expect(screen.getByText("protected-content")).toBeInTheDocument();
      expect(
        screen.queryByText("request-membership-page"),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Guard lifts after user gains membership
  // ---------------------------------------------------------------------------
  describe("Scenario 5 – guard lifts after user gains membership", () => {
    it("renders protected content when user has at least one group", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [groupA] });

      renderGuard("/");

      expect(screen.getByText("protected-content")).toBeInTheDocument();
      expect(
        screen.queryByText("request-membership-page"),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Additional: /request-membership itself is not blocked by NoGroupGuard
  // ---------------------------------------------------------------------------
  describe("Additional – /request-membership route bypasses guard", () => {
    it("renders the membership page when navigating directly to /request-membership", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      renderGuard("/request-membership");

      expect(screen.getByText("request-membership-page")).toBeInTheDocument();
    });
  });
});

/**
 * Renders MembershipPageGuard with a home sentinel so we can assert redirects.
 */
function renderMembershipGuard(initialPath = "/request-membership") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>home-page</div>} />
        <Route
          path="/request-membership"
          element={
            <MembershipPageGuard>
              <div>membership-page-content</div>
            </MembershipPageGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MembershipPageGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Guard does not flash during loading
  // ---------------------------------------------------------------------------
  describe("loading state", () => {
    it("renders nothing while auth is still loading", () => {
      mockUseAuth.mockReturnValue({ isLoading: true, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      const { container } = renderMembershipGuard();

      expect(container).toBeEmptyDOMElement();
    });
  });

  // ---------------------------------------------------------------------------
  // User with no groups sees the page
  // ---------------------------------------------------------------------------
  describe("user with no groups can view the page", () => {
    it("renders membership page content when user has no groups and is not system-admin", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      renderMembershipGuard();

      expect(screen.getByText("membership-page-content")).toBeInTheDocument();
      expect(screen.queryByText("home-page")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // User with groups is redirected home
  // ---------------------------------------------------------------------------
  describe("user with groups is redirected to home", () => {
    it("redirects to / when user already has groups", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: false });
      mockUseGroup.mockReturnValue({ availableGroups: [groupA] });

      renderMembershipGuard();

      expect(screen.getByText("home-page")).toBeInTheDocument();
      expect(
        screen.queryByText("membership-page-content"),
      ).not.toBeInTheDocument();
    });

    it("redirects to / when user is a system-admin", () => {
      mockUseAuth.mockReturnValue({ isLoading: false, isSystemAdmin: true });
      mockUseGroup.mockReturnValue({ availableGroups: [] });

      renderMembershipGuard();

      expect(screen.getByText("home-page")).toBeInTheDocument();
      expect(
        screen.queryByText("membership-page-content"),
      ).not.toBeInTheDocument();
    });
  });
});
