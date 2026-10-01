import React, { createContext, ReactNode, useContext, useState } from "react";
import { type Group, useAuth } from "./AuthContext";
import { Permission } from "./permissions";

const ACTIVE_GROUP_ID_KEY = "activeGroupId";

/**
 * API exposed by `GroupProvider`. Any component can consume these helpers via `useGroup`.
 */
interface GroupContextType {
  /** All groups the authenticated user belongs to. */
  availableGroups: Group[];
  /** The currently active group, or null if the user has no memberships. */
  activeGroup: Group | null;
  /** Updates the active group and persists the selection to localStorage. */
  setActiveGroup: (group: Group) => void;
  /** Checks whether a group (by ID) has all of the required permissions. */
  hasPermissionForGroup: (
    groupId: string,
    requiredPermissions: Permission[],
  ) => boolean;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

interface GroupProviderProps {
  children: ReactNode;
}

/**
 * Provider that manages the user's active group selection.
 *
 * On initialisation it attempts to restore the previously selected group from
 * `localStorage`. If the stored group id no longer exists in the user's
 * memberships (or no value was stored), it falls back to the first available
 * group. When the user has no memberships `activeGroup` is `null`.
 */
export const GroupProvider: React.FC<GroupProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const availableGroups: Group[] = user?.groups ?? [];

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_GROUP_ID_KEY),
  );

  // Derived during render rather than held in state, so it is set in the same
  // render as the user's groups. Route guards read it on the first render after
  // /me returns, and a null there redirects a full page load to "/".
  const activeGroup =
    availableGroups.find((g) => g.id === selectedGroupId) ??
    availableGroups[0] ??
    null;

  /**
   * Updates the active group and persists its id to localStorage.
   *
   * @param group - The group to make active.
   */
  const setActiveGroup = (group: Group): void => {
    localStorage.setItem(ACTIVE_GROUP_ID_KEY, group.id);
    setSelectedGroupId(group.id);
  };

  const hasPermissionForGroup = (
    groupId: string,
    requiredPermissions: Permission[],
  ): boolean => {
    const group = availableGroups.find((g) => g.id === groupId);
    if (!group) return false;
    return requiredPermissions.every((p) => group.permissions?.includes(p));
  };

  const value: GroupContextType = {
    availableGroups,
    activeGroup,
    setActiveGroup,
    hasPermissionForGroup,
  };

  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
};

/**
 * Convenience hook for consuming the group context.
 *
 * @throws {Error} When called outside of a `GroupProvider`.
 * @returns The current `GroupContextType` value.
 */
export const useGroup = (): GroupContextType => {
  const context = useContext(GroupContext);
  if (context === undefined) {
    throw new Error("useGroup must be used within a GroupProvider");
  }
  return context;
};
