import { GroupRole } from "@generated/client";
import { Permission, RoleClaimsMap } from "./role-permissions";

/**
 * Every permission the review queue and review workspace use, keyed by the
 * call that needs it. A reviewer missing any of these cannot finish a review.
 */
const REVIEW_FLOW_PERMISSIONS: [string, Permission][] = [
  ["GET /hitl/queue and /hitl/queue/stats", Permission.HITL_QUEUE_RETRIEVE],
  ["POST /hitl/sessions", Permission.HITL_SESSION_CREATE],
  [
    "POST /hitl/sessions/next and GET /hitl/sessions/:id",
    Permission.HITL_SESSION_RETRIEVE,
  ],
  [
    "POST /hitl/sessions/:id/submit, skip, flag and heartbeat",
    Permission.HITL_SESSION_PROGRESS,
  ],
  ["POST /hitl/sessions/:id/reopen", Permission.HITL_SESSION_REOPEN],
  ["POST /hitl/sessions/:id/corrections", Permission.HITL_CORRECTION_SUBMIT],
  [
    "DELETE /hitl/sessions/:id/corrections/:correctionId",
    Permission.HITL_CORRECTION_DELETE,
  ],
  ["POST /documents/:documentId/approve", Permission.HITL_APPROVE_DENY],
  ["GET /documents/:documentId/view", Permission.DOCUMENT_VIEW],
  ["GET /documents/:documentId/download", Permission.DOCUMENT_DOWNLOAD],
  ["GET /groups/:groupId/members", Permission.GROUP_RETRIEVE],
  ["DELETE /groups/:groupId/leave", Permission.GROUP_LEAVE],
];

describe("RoleClaimsMap", () => {
  it("holds only Permission values, never the enum's reverse-mapped names", () => {
    for (const role of Object.values(GroupRole)) {
      for (const permission of RoleClaimsMap[role]) {
        expect(typeof permission).toBe("number");
      }
    }
  });

  it.each(
    REVIEW_FLOW_PERMISSIONS,
  )("lets a reviewer call %s", (_call, permission) => {
    expect(RoleClaimsMap[GroupRole.REVIEWER]).toContain(permission);
  });

  it.each([
    Permission.HITL_DATASET_CREATE,
    Permission.HITL_DATASET_UPDATE,
    Permission.HITL_DATASET_RETRIEVE,
  ])("keeps benchmark dataset permission %s away from reviewers", (permission) => {
    expect(RoleClaimsMap[GroupRole.REVIEWER]).not.toContain(permission);
  });

  it.each(
    Object.values(GroupRole),
  )("lets %s see its group's members and leave the group", (role) => {
    expect(RoleClaimsMap[role]).toContain(Permission.GROUP_RETRIEVE);
    expect(RoleClaimsMap[role]).toContain(Permission.GROUP_LEAVE);
  });
});
