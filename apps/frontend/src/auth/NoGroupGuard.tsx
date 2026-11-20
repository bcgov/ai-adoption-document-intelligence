import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useGroup } from "./GroupContext";
import { Permission } from "./permissions";

interface NoGroupGuardProps {
  children: ReactNode;
}

/**
 * Route guard that redirects authenticated non-admin users with no group
 * memberships to the `/request-membership` page.
 *
 * The guard waits until `AuthContext` has finished loading before evaluating,
 * preventing premature redirects during the initial auth resolution phase.
 *
 * System-admin users (role: `system-admin`) are exempt from this guard and
 * always see the protected content.
 *
 * @param props.children - The protected content to render when the guard passes.
 */
export function NoGroupGuard({ children }: NoGroupGuardProps): ReactNode {
  const { isLoading, isSystemAdmin } = useAuth();
  const { availableGroups } = useGroup();

  if (isLoading) {
    return null;
  }

  if (!isSystemAdmin && availableGroups.length === 0) {
    return <Navigate to="/request-membership" replace />;
  }

  return children;
}

/**
 * Inverse guard for the `/request-membership` route.
 *
 * Redirects users who already have group access (or are system-admins) back to
 * the home page `/`. This prevents a user who refreshes `/request-membership`
 * after gaining group membership from remaining stuck on that page.
 *
 * The guard waits until `AuthContext` has finished loading before evaluating,
 * preventing premature redirects during the initial auth resolution phase.
 *
 * @param props.children - The membership page content to show when the guard passes.
 */
export function MembershipPageGuard({
  children,
}: NoGroupGuardProps): ReactNode {
  const { isLoading, isSystemAdmin } = useAuth();
  const { availableGroups } = useGroup();

  if (isLoading) {
    return null;
  }

  if (isSystemAdmin || availableGroups.length > 0) {
    return <Navigate to="/" replace />;
  }

  return children;
}

interface GroupPermissionGuardProps {
  children: ReactNode;
  requiredPermissions: Permission[];
}

export function GroupPermissionGuard({
  children,
  requiredPermissions,
}: GroupPermissionGuardProps): ReactNode {
  const { isLoading, isSystemAdmin } = useAuth();
  const { activeGroup, hasPermissionForGroup } = useGroup();

  if (isLoading) {
    return null;
  }

  // Get the user's active group, and check if they have permission to be here.
  // A system admin always has permission.
  if (isSystemAdmin || requiredPermissions.length === 0) return children;
  if (
    activeGroup == null ||
    !hasPermissionForGroup(activeGroup.id, requiredPermissions)
  ) {
    return <Navigate to="/" replace />;
  }

  return children;
}
