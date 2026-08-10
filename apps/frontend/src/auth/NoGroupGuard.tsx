import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useGroup } from "./GroupContext";

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

// This list is for frontend reference only.
// It should match the authoritative source in backend-services/src/auth/role-permissions.ts
// The mapping of roles to permissions comes from the backend.
export enum Permission {
  // API-keys
  API_KEY_RETRIEVE,
  API_KEY_CREATE,
  API_KEY_DELETE,
  // Benchmarks
  BENCHMARK_CREATE,
  BENCHMARK_RETRIEVE,
  BENCHMARK_UPDATE,
  BENCHMARK_SCHEDULE,
  BENCHMARK_DELETE,
  BENCHMARK_FILES,
  BENCHMARK_GROUND_TRUTH,
  // Classifiers
  CLASSIFIER_RETRIEVE,
  CLASSIFIER_CREATE,
  CLASSIFIER_UPDATE,
  CLASSIFIER_USE,
  CLASSIFIER_FILES,
  CLASSIFIER_TRAIN,
  CLASSIFIER_DELETE,
  // Confusion Profiles
  CONFUSION_CREATE,
  CONFUSION_RETRIEVE,
  CONFUSION_UPDATE,
  CONFUSION_DELETE,
  // Documents
  DOCUMENT_RETRIEVE,
  DOCUMENT_CREATE,
  DOCUMENT_DELETE,
  DOCUMENT_UPDATE,
  DOCUMENT_VIEW,
  DOCUMENT_DOWNLOAD,
  // Groups
  // GROUP_CREATE, // Should only be system-admin
  // GROUP_DELETE, // Should only be system-admin
  GROUP_UPDATE,
  GROUP_RETRIEVE,
  GROUP_LEAVE,
  GROUP_REQUESTS_RETRIEVE,
  GROUP_REQUESTS_APPROVE_DENY,
  GROUP_USER_REMOVE,
  GROUP_USER_ADD,
  GROUP_USER_ROLE_UPDATE,
  // HITL
  HITL_QUEUE_RETRIEVE,
  HITL_SESSION_RETRIEVE,
  HITL_SESSION_PROGRESS,
  HITL_SESSION_REOPEN,
  HITL_SESSION_CREATE,
  HITL_CORRECTION_SUBMIT,
  HITL_CORRECTION_RETRIEVE,
  HITL_CORRECTION_DELETE,
  HITL_DATASET_CREATE,
  HITL_DATASET_RETRIEVE,
  HITL_DATASET_UPDATE,
  HITL_APPROVE_DENY,
  // OCR
  OCR_RESULTS_RETRIEVE,
  OCR_MODELS_RETRIEVE,
  OCR_REPROCESS,
  // Tables
  TABLE_RETRIEVE,
  TABLE_CREATE,
  TABLE_UPDATE,
  TABLE_DELETE,
  TABLE_COLUMN_CREATE,
  TABLE_COLUMN_UPDATE,
  TABLE_COLUMN_DELETE,
  TABLE_ROW_CREATE,
  TABLE_ROW_UPDATE,
  TABLE_ROW_DELETE,
  TABLE_ROW_RETRIEVE,
  // Template Models
  TEMPLATE_MODEL_RETRIEVE,
  TEMPLATE_MODEL_UPDATE,
  TEMPLATE_MODEL_DELETE,
  TEMPLATE_MODEL_CREATE,
  TEMPLATE_MODEL_FIELDS_RETRIEVE,
  TEMPLATE_MODEL_FIELDS_CREATE,
  TEMPLATE_MODEL_FIELDS_UPDATE,
  TEMPLATE_MODEL_FIELDS_DELETE,
  TEMPLATE_MODEL_DOCUMENT_RETRIEVE,
  TEMPLATE_MODEL_DOCUMENT_CREATE,
  TEMPLATE_MODEL_DOCUMENT_DELETE,
  TEMPLATE_MODEL_LABEL_RETRIEVE,
  TEMPLATE_MODEL_LABEL_CREATE,
  TEMPLATE_MODEL_LABEL_DELETE,
  TEMPLATE_MODEL_SUGGESTIONS,
  TEMPLATE_MODEL_EXPORT,
  // Training
  TRAINING_RETRIEVE,
  TRAINING_CREATE,
  TRAINING_DELETE,
  // Workflows
  WORKFLOW_RETRIEVE,
  WORKFLOW_CREATE,
  WORKFLOW_UPDATE,
  WORKFLOW_DELETE,
  NO_EXIST_TEST,
}
