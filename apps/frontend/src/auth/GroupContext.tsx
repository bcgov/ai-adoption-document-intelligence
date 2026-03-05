import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { type Group, useAuth } from "./AuthContext";

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

  const resolveInitialGroup = (groups: Group[]): Group | null => {
    if (groups.length === 0) return null;

    const storedId = localStorage.getItem(ACTIVE_GROUP_ID_KEY);
    if (storedId) {
      const match = groups.find((g) => g.id === storedId);
      if (match) return match;
    }

    return groups[0];
  };

  const [activeGroup, setActiveGroupState] = useState<Group | null>(() =>
    resolveInitialGroup(availableGroups),
  );

  /**
   * Re-resolve the active group whenever the user's group list changes
   * (e.g. after a fresh /me response).
   */
  useEffect(() => {
    setActiveGroupState(resolveInitialGroup(availableGroups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.groups]);

  /**
   * Updates the active group in state and persists its id to localStorage.
   *
   * @param group - The group to make active.
   */
  const setActiveGroup = (group: Group): void => {
    localStorage.setItem(ACTIVE_GROUP_ID_KEY, group.id);
    setActiveGroupState(group);
  };

  const value: GroupContextType = {
    availableGroups,
    activeGroup,
    setActiveGroup,
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
