import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupProvider, useGroup } from "./GroupContext";

/**
 * Mock data helpers
 */
const groupA = { id: "group-a", name: "Group Alpha" };
const groupB = { id: "group-b", name: "Group Beta" };
const groupC = { id: "group-c", name: "Group Gamma" };

/**
 * Mocked useAuth – overridden per test via `mockReturnValue`.
 */
const mockUseAuth = vi.fn();

vi.mock("./AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

/**
 * Wrapper factory: wraps the hook under test in GroupProvider.
 */
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <GroupProvider>{children}</GroupProvider>
);

describe("GroupContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Context provides required values
  // ---------------------------------------------------------------------------
  describe("Scenario 1 – context provides required values", () => {
    it("exposes availableGroups, activeGroup, and setActiveGroup", () => {
      mockUseAuth.mockReturnValue({ user: { groups: [groupA, groupB] } });

      const { result } = renderHook(() => useGroup(), { wrapper });

      expect(result.current).toHaveProperty("availableGroups");
      expect(result.current).toHaveProperty("activeGroup");
      expect(result.current).toHaveProperty("setActiveGroup");
      expect(typeof result.current.setActiveGroup).toBe("function");
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Auto-selects first group on initial load (no localStorage)
  // ---------------------------------------------------------------------------
  describe("Scenario 2 – auto-selects first group on initial load", () => {
    it("sets activeGroup to the first entry in availableGroups when localStorage is empty", () => {
      mockUseAuth.mockReturnValue({ user: { groups: [groupA, groupB] } });

      const { result } = renderHook(() => useGroup(), { wrapper });

      expect(result.current.activeGroup).toEqual(groupA);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Restores persisted group from localStorage
  // ---------------------------------------------------------------------------
  describe("Scenario 3 – restores persisted group from localStorage", () => {
    it("sets activeGroup to the stored group when activeGroupId matches a membership", () => {
      localStorage.setItem("activeGroupId", groupB.id);
      mockUseAuth.mockReturnValue({
        user: { groups: [groupA, groupB, groupC] },
      });

      const { result } = renderHook(() => useGroup(), { wrapper });

      expect(result.current.activeGroup).toEqual(groupB);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Falls back to first group when persisted ID is stale
  // ---------------------------------------------------------------------------
  describe("Scenario 4 – falls back to first group when persisted ID is stale", () => {
    it("sets activeGroup to the first entry when stored id is not in availableGroups", () => {
      localStorage.setItem("activeGroupId", "stale-group-id");
      mockUseAuth.mockReturnValue({
        user: { groups: [groupA, groupB] },
      });

      const { result } = renderHook(() => useGroup(), { wrapper });

      expect(result.current.activeGroup).toEqual(groupA);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: activeGroup is null when user has no memberships
  // ---------------------------------------------------------------------------
  describe("Scenario 5 – activeGroup is null when user has no memberships", () => {
    it("sets activeGroup to null when availableGroups is empty", () => {
      mockUseAuth.mockReturnValue({ user: { groups: [] } });

      const { result } = renderHook(() => useGroup(), { wrapper });

      expect(result.current.activeGroup).toBeNull();
    });

    it("sets activeGroup to null when user is null", () => {
      mockUseAuth.mockReturnValue({ user: null });

      const { result } = renderHook(() => useGroup(), { wrapper });

      expect(result.current.activeGroup).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Active group change is persisted to localStorage
  // ---------------------------------------------------------------------------
  describe("Scenario 6 – active group change is persisted to localStorage", () => {
    it("updates localStorage activeGroupId when setActiveGroup is called", () => {
      mockUseAuth.mockReturnValue({ user: { groups: [groupA, groupB] } });

      const { result } = renderHook(() => useGroup(), { wrapper });

      act(() => {
        result.current.setActiveGroup(groupB);
      });

      expect(result.current.activeGroup).toEqual(groupB);
      expect(localStorage.getItem("activeGroupId")).toBe(groupB.id);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: useGroup throws outside of provider
  // ---------------------------------------------------------------------------
  describe("Scenario 7 – useGroup throws outside of provider", () => {
    it("throws an error when useGroup is called outside GroupProvider", () => {
      mockUseAuth.mockReturnValue({ user: { groups: [] } });

      expect(() => renderHook(() => useGroup())).toThrow(
        "useGroup must be used within a GroupProvider",
      );
    });
  });
});
