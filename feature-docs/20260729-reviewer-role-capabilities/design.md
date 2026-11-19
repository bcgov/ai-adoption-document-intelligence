# Authorization v2: capability sets and resource policies

**Status:** design, ready for implementation
**Date:** 2026-07-30
**Supersedes:** `design-v1-low-touch-superseded.md` — a minimal retrofit that kept
`ROLE_ORDER` and added one capability layer on top. This document replaces it with the
model we would build from scratch. The Reviewer role is the first thing it delivers, not
the thing it is designed around.

**Baseline:** every file:line reference and every count in this document is against
**`develop`**. Re-derive if `develop` has moved.

---

## The approach in brief

*Plain-language summary. Everything below is the detailed version.*

### The two ideas

**1. A role is a set of capabilities. There is no ladder.**

Today `GroupRole` is an opaque string (`ADMIN`, `MEMBER`) and a separate table,
`ROLE_ORDER`, asserts that admin outranks member by giving them numbers. That numeric
ladder is a *lossy encoding of set inclusion*. Once a role simply **is** its capability
set, "admin outranks member" stops being an assertion and becomes an observation:

```
MEMBER = { documents.read, workflows.manage, tables.read, … }
ADMIN  = MEMBER ∪ { group.manage, group.apikeys.manage, tables.schema.manage, … }
                   └─ so ADMIN ⊃ MEMBER, for free
```

And the thing the ladder could never express — a reviewer and an analyst who are neither
above nor below each other — is just two sets that don't nest. Sets are a partial order.
That is the correct shape; a total order never was.

**2. Two layers, because "what kind of thing may you do" and "may you do it to *this*"
are different questions.**

```
Layer 1 — CAPABILITY:  may this identity ever perform this kind of action?
                       static, cheap, decided in IdentityGuard from the session

Layer 2 — RESOURCE POLICY:  may they perform it on this specific object?
                            needs the object loaded, decided in the service layer
```

The codebase already has a degenerate layer 2: `identityCanAccessGroup(identity, groupId)`
understands exactly one relationship — *"this resource's `group_id` is one of yours"*.
Every other relationship has to be smuggled in by hand, which is why a reviewer needing
to read one specific document has no way to say so. Making layer 2 a real policy layer is
what turns "reviewers see only documents they hold a session on" from a redesign into a
clause.

### How a request is decided

```
1. Authenticated?                     JwtAuthGuard / ApiKeyAuthGuard   (unchanged)
2. System admin?                      → bypass everything               (unchanged)
3. Which capability does this route need?    @RequireCapability, mandatory
4. Narrow groupRoles to groups whose role holds it.  None left → 403.
5. Handler runs. For a specific resource, the service asks the policy layer:
   assertCan(identity, capability, resource)  /  scopeFor(identity, capability)
```

Step 4 is the trick worth keeping from v1: **narrow the per-request group map once**, and
every existing group-filtered query downstream becomes correct without being edited,
because as far as it can tell the user simply isn't in that group.

### What Reviewer looks like in this model

```
REVIEWER = { hitl.review, documents.read, self }
```

- The review queue → `hitl.review`. Held. Works.
- The documents *list* → `documents.list`. Not held → group narrowed away → empty list.
- A document by ID → `documents.read`. Held, so layer 1 passes; then layer 2 asks
  *"does this identity hold an open review session on this document?"* — which is the
  only reason a reviewer can fetch the page image, and the reason they can't fetch
  anybody else's.

Note there is **no bespoke `GET /api/hitl/sessions/:id/document` endpoint**. v1 needed one
because it had nowhere to put "…because they hold a session on it". Here that sentence has
a home, so the ordinary document endpoint serves reviewers correctly.

### The honest costs

- **Every route must declare a capability.** There is no "general access" bucket to fall
  into, which is the price of not having a wildcard. 188 endpoints across 23 controllers.
  Mitigated by a boot-time completeness check (§5.3) — forget one and the app fails to
  start, in CI, rather than locking members out in production.
- **`identityCanAccessGroup`'s 105 call sites become policy calls**, eventually. Staged so
  that most of them keep working untouched for most of the migration (§9).
- **The Reviewer role does not need all of that first.** It ships at the end of Phase 1,
  with three controllers annotated. Phases 2–4 pay off the architecture afterwards.

---

## 1. What exists today (verified against `develop`)

### 1.1 The two axes

| Axis | Where | Values |
|---|---|---|
| Global admin | `user.is_system_admin` (`apps/shared/prisma/schema.prisma:138`) | boolean |
| Per-group role | `user_group.role` (`schema.prisma:430`), enum `GroupRole` (`schema.prisma:841`) | `ADMIN`, `MEMBER` |

`GroupRole` is compared through `ROLE_ORDER` (`apps/backend-services/src/auth/role-order.ts`,
`MEMBER: 0`, `ADMIN: 1`).

### 1.2 Enforcement

Two mechanisms, both reading `request.resolvedIdentity.groupRoles` — a
`Record<groupId, GroupRole>` built by `IdentityGuard` from the database on the JWT path,
or hardcoded to `{ [groupId]: MEMBER }` on the API-key path (`identity.guard.ts:83`).

1. **Declarative** — `@Identity({ groupIdFrom, minimumRole })`, enforced in
   `IdentityGuard.canActivate`.
2. **Imperative** — `identityCanAccessGroup(identity, groupId, minimumRole?)` and
   `getIdentityGroupIds(identity)` (`identity.helpers.ts:84` and `:44`).

Counts, non-test, excluding the definitions:

| | Sites |
|---|---|
| `identityCanAccessGroup(` | **105** (118 including specs) |
| `getIdentityGroupIds(` | **13** (20 including specs) |
| Controllers | **23** |
| HTTP endpoints | **188** |
| `@Public()` routes | 8 (health ×3, metrics ×1, auth ×4) |
| `requireSystemAdmin: true` | 2 (`group.controller.ts:69`, `:332`) |

**Nothing outside `apps/backend-services/src/auth/` reads `identity.groupRoles`** except
`testUtils/testFactory.ts`, which only types it. There is no WebSocket or SSE gateway, and
`apps/temporal` does not call either helper. `IdentityGuard` is genuinely the only place
identity is resolved.

### 1.3 The `MEMBER` floor, and why 22 of its uses are lies

`identityCanAccessGroup`'s third parameter defaults to `GroupRole.MEMBER`
(`identity.helpers.ts:87`), so all 105 call sites apply a `MEMBER` floor whether or not
they ask for one. Explicit floors on top:

| Path | `ADMIN` | `MEMBER` |
|---|---|---|
| Declarative `minimumRole:` | 8 | 14 |
| Imperative 3-arg | 13 | 8 |

`ROLE_ORDER[MEMBER]` is `0` and nothing is `< 0`, so **every one of the 22 `MEMBER`
entries is a no-op** — behaviourally identical to omitting the argument. They are not
merely redundant: once a restricted role exists, `minimumRole: GroupRole.MEMBER` actively
misleads a reader into thinking it excludes that role. Deleted in Phase 3.

The 21 `ADMIN` gates are the only load-bearing uses of the ladder in the codebase.

### 1.4 `ADMIN` already means two unrelated things

This is the finding that decides the design. The 21 `ADMIN` gates split cleanly into two
groups that have nothing to do with each other:

**Group administration** (17 gates)

| Where | Handler |
|---|---|
| `group.controller.ts:301` | `updateGroup` |
| `group.controller.ts:359` | `addGroupMember` |
| `group.controller.ts:406` | `getGroupRequests` |
| `group.controller.ts:471` | `removeGroupMember` |
| `group.controller.ts:505` | `updateGroupMemberRole` |
| `group.service.ts:288` | `approveMembershipRequest` |
| `group.service.ts:341` | `denyMembershipRequest` |
| `api-key.controller.ts:44, 68, 110, 135` | list / create / delete / regenerate API keys |
| `azure.controller.ts:669` | `DELETE classifiers/:groupId/:classifierName` |

**Reference-data curation** (9 gates, all in `tables.controller.ts`)

Table *schema* is admin-tier; table *rows* are member-tier:

```
@Get()  @Get(":tableId")  @Post()                          → member
@Patch(":tableId")  @Delete(":tableId")                     → ADMIN
@Post/@Patch/@Delete(":tableId/columns…")                   → ADMIN
@Post/@Patch/@Delete(":tableId/lookups…")                   → ADMIN
@Get/@Post/@Patch/@Delete(":tableId/rows…")                 → member
```

So a second privilege dimension is *already present*. Today "may curate reference data"
and "may administer the group" are the same flag, and there is no way to separate them.
The ladder cannot express this and never will — which is the concrete, present-tense
justification for capabilities, independent of the Reviewer role.

### 1.5 The Reviewer surface

- **Backend HITL:** `hitl.controller.ts:50`, `@Controller("api/hitl")`, 14 endpoints, all
  `@Identity({ allowApiKey: true })` with no role requirement, 14 two-arg
  `identityCanAccessGroup` calls (lines 68, 123, 150, 173, 193, 226, 245, 274, 297, 316,
  336, 357, 383, 402) and 4 `getIdentityGroupIds` calls (71, 126, 153, 405).
- **Frontend:** `/review` (`App.tsx:84`) and `/review/:sessionId` (`:85`).
- **The review canvas is not HITL-only.** `ReviewWorkspacePage.tsx:261` and `:268` fetch
  `GET /api/documents/:id/view` (`document.controller.ts:550`) falling back to
  `/download` (`:683`). This is what layer 2 exists to handle.
- **Session ownership is expressible.** `ReviewSession` (`schema.prisma:485`) has
  `document_id`, `actor_id`, and `status` (`ReviewStatus`: `in_progress`, `approved`,
  `escalated`, `skipped`). `DocumentLock` (`:500`) additionally carries `reviewer_id` and
  `expires_at`. Both give layer 2 everything it needs.

### 1.6 Frontend today

- `App.tsx` — every route reachable by any authenticated user passing `NoGroupGuard`
  (which only checks "has at least one group").
- `RootLayout.tsx:64` — `navItems`, a static array; `benchmarkingNavItems` at `:124`.
  **Settings is not in `navItems`** — hand-written markup at `:303` and `:325-342`.
- `AuthContext.tsx:20` types `role?: "ADMIN" | "MEMBER"`.
- `GroupContext.tsx:40` reads `user.groups` from `/api/auth/me`; switching groups costs no
  request.
- `GROUP_ROLE_OPTIONS` (`data/hooks/useGroups.ts:28`) is a hardcoded two-entry array.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | A role **is** a capability set. `ROLE_ORDER` is deleted. | Ordering falls out as set inclusion. Incomparable roles need no special case. §1.4 shows the codebase already needs this. |
| D2 | Role capability sets are **derived**, not hand-listed. | `MEMBER = ALL \ ADMIN_ONLY`, `ADMIN = ALL`. A new feature capability lands in both automatically; a new admin capability is excluded from `MEMBER` automatically. No wildcard, no drift. |
| D3 | **Every route declares a capability.** No default bucket. | A default is where restricted roles silently gain access. Enforced at boot (§5.3), so the failure mode is a red CI run, not a production lockout. |
| D4 | Instance-level authorization lives in a **resource policy layer**, separate from capabilities. | Capabilities describe kinds of action; they cannot describe instances. Without this layer, "read this document because you hold a session on it" requires inventing an endpoint. |
| D5 | Capabilities are **code**, roles are **data**. | Roles are assigned per group in the DB; the capability sets they map to are a const. No capability tables or management UI until customers need to define their own roles — a different product decision. |
| D6 | `is_system_admin` stays a **hard boolean bypass**, never a capability. | Every system needs an unnarrowable escape hatch. Making it a capability risks it being narrowed. |
| D7 | Effective capabilities are **served to the frontend** from `/api/auth/me`, not mirrored in TypeScript. | v1 kept two maps "in step by intent". One source of truth is strictly better and costs one field. |

---

## 3. Capability vocabulary

Derived from the controller inventory. **Granularity rule: a capability exists only where
the codebase already draws a line, or where a real persona needs one side and not the
other.** Never split speculatively — that is how vocabularies rot.

`apps/backend-services/src/auth/capabilities.ts`:

```ts
export const CAPABILITIES = {
  // --- self -------------------------------------------------------------
  SELF: "self",                                   // GET /api/auth/me

  // --- documents --------------------------------------------------------
  DOCUMENTS_LIST: "documents.list",               // browse/search the corpus
  DOCUMENTS_READ: "documents.read",               // one document, incl. bytes + OCR
  DOCUMENTS_WRITE: "documents.write",             // upload, patch, approve
  DOCUMENTS_DELETE: "documents.delete",

  // --- human review -----------------------------------------------------
  HITL_REVIEW: "hitl.review",                     // queue + sessions + corrections
  HITL_ANALYTICS: "hitl.analytics",               // GET /api/hitl/analytics

  // --- authoring --------------------------------------------------------
  WORKFLOWS_MANAGE: "workflows.manage",
  TEMPLATES_MANAGE: "templates.manage",
  TEMPLATES_TRAIN: "templates.train",
  CLASSIFIERS_MANAGE: "classifiers.manage",
  CONFUSION_PROFILES_MANAGE: "confusionProfiles.manage",
  OCR_RUN: "ocr.run",
  BENCHMARK_MANAGE: "benchmark.manage",

  // --- reference data ---------------------------------------------------
  TABLES_READ: "tables.read",
  TABLES_ROWS_WRITE: "tables.rows.write",

  // --- group -------------------------------------------------------------
  GROUP_READ: "group.read",                       // see your group + members

  // --- admin-tier (excluded from MEMBER) ---------------------------------
  TABLES_SCHEMA_MANAGE: "tables.schema.manage",   // §1.4: today conflated with group admin
  CLASSIFIERS_DELETE: "classifiers.delete",       // azure.controller.ts:669
  GROUP_MANAGE: "group.manage",                   // members, roles, requests, settings
  GROUP_APIKEYS_MANAGE: "group.apikeys.manage",
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];
```

Twenty capabilities, each traceable to an existing line in the code.

### Why these particular splits

| Split | Because |
|---|---|
| `documents.list` vs `documents.read` | Reviewer needs one document, not the corpus. Without the split, narrowing keeps their group on the list endpoint and they see everything. |
| `hitl.review` vs `hitl.analytics` | Analytics is throughput data about other reviewers. Nothing in the frontend calls `/api/hitl/analytics` (verified), so withholding it costs no UX. |
| `tables.read` / `tables.rows.write` / `tables.schema.manage` | §1.4 — the three tiers already exist in `tables.controller.ts`. |
| `templates.manage` vs `templates.train` | `training.controller.ts` shares the `api/template-models` prefix but is a separate controller with 10 endpoints; training is expensive and plausibly restricted later. Cheap to merge if that never happens. |

### Routes with no capability

`@Public()` routes (health ×3, metrics ×1, auth's `refresh`/`login`/`logout`/`callback`)
never reach `IdentityGuard`'s capability logic and are exempt from the boot check.

---

## 4. Role composition

`ROLE_CAPABILITIES` is computed, not written out:

```ts
import { GroupRole } from "@generated/client";
import { CAPABILITIES, type Capability } from "./capabilities";

/** Capabilities withheld from ordinary members. The ONLY hand-maintained list. */
const ADMIN_ONLY: readonly Capability[] = [
  CAPABILITIES.GROUP_MANAGE,
  CAPABILITIES.GROUP_APIKEYS_MANAGE,
  CAPABILITIES.TABLES_SCHEMA_MANAGE,
  CAPABILITIES.CLASSIFIERS_DELETE,
];

const ALL = Object.values(CAPABILITIES) as readonly Capability[];

export const ROLE_CAPABILITIES: Record<GroupRole, ReadonlySet<Capability>> = {
  [GroupRole.ADMIN]: new Set(ALL),
  [GroupRole.MEMBER]: new Set(ALL.filter((c) => !ADMIN_ONLY.includes(c))),
  [GroupRole.REVIEWER]: new Set([
    CAPABILITIES.HITL_REVIEW,
    CAPABILITIES.DOCUMENTS_READ,
    CAPABILITIES.GROUP_READ,
    CAPABILITIES.SELF,
  ]),
};

export function roleHasCapability(role: GroupRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function roleHasAnyCapability(
  role: GroupRole,
  capabilities: readonly Capability[],
): boolean {
  return capabilities.some((c) => roleHasCapability(role, c));
}
```

Read the properties off it:

- `MEMBER ⊂ ADMIN` by construction. Nothing asserts it; nothing can contradict it.
- A new **feature** capability is in `MEMBER` and `ADMIN` the moment it is added to
  `CAPABILITIES`. This is what the v1 wildcard was faking, obtained honestly.
- A new **admin** capability is excluded from `MEMBER` by adding one line to `ADMIN_ONLY`.
- `REVIEWER` is listed explicitly, because a restricted role is exactly the case where
  enumeration is the point.
- Restricted roles are **not** subsets of `MEMBER` in general — `REVIEWER` is here, but a
  future role could hold something `MEMBER` lacks. Nothing in the model assumes otherwise.

### `ROLE_ORDER` is deleted

`role-order.ts` goes away entirely in Phase 3. Nothing replaces it. "Is this user an
admin of this group?" becomes `roleHasCapability(role, GROUP_MANAGE)` at the one or two
places that genuinely ask.

---

## 5. Layer 1 — capabilities

### 5.1 `@RequireCapability()`

`apps/backend-services/src/auth/capability.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";
import type { Capability } from "./capabilities";

export const CAPABILITY_KEY = "capability";

/**
 * Declares the capabilities a handler (or every handler on a controller) accepts.
 * A group passes if its role grants ANY of them. Mandatory on every non-@Public
 * route; absence is a boot-time error (see capability-coverage.ts).
 */
export const RequireCapability = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITY_KEY, capabilities);
```

Named `RequireCapability`, not `Capability`, because the latter is the type name and a
value and type with the same identifier collide when both are imported.

Resolved with `reflector.getAllAndOverride(CAPABILITY_KEY, [handler, class])` — the same
pattern `IdentityGuard` already uses for `IDENTITY_KEY`, so method-level overrides
class-level.

**Any-of semantics.** `@RequireCapability("hitl.review", "benchmark.manage")` passes if
the role holds either. This is the combinator scope needs: two restricted personas may
legitimately share one endpoint. It is *not* the combinator privilege needs — see the
gotcha in §10.3.

### 5.2 `IdentityGuard` — narrow, then deny

In `identity.guard.ts`, on the JWT path, immediately after `groupRoles` is built from
`user.userGroups` (`:97-100`) and **before** `resolvedIdentity` is assigned (`:102`):

```ts
const required = this.reflector.getAllAndOverride<Capability[] | undefined>(
  CAPABILITY_KEY,
  [context.getHandler(), context.getClass()],
);

if (required === undefined) {
  // Should be unreachable — capability-coverage.ts fails the boot. Defensive only.
  throw new ForbiddenException("Route declares no capability");
}

// System admins are never narrowed (D6).
let permitted = groupRoles;

if (!user.is_system_admin) {
  permitted = {};
  for (const [groupId, role] of Object.entries(groupRoles)) {
    if (roleHasAnyCapability(role, required)) permitted[groupId] = role;
  }

  // The user has memberships, but none of them permit this handler.
  if (Object.keys(groupRoles).length > 0 && Object.keys(permitted).length === 0) {
    throw new ForbiddenException("Your role does not grant access to this resource");
  }
}

request.resolvedIdentity = {
  userId,
  isSystemAdmin: user.is_system_admin,
  groupRoles: permitted,
  actorId: user.actor_id,
};
```

The `!is_system_admin` check wraps the **whole** block, not just the deny. A system admin
who also holds `REVIEWER` somewhere would otherwise have that group stripped. Invisible
today — both helpers and the `groupIdFrom` block (`:139`) short-circuit on `isSystemAdmin`
— but it contradicts D6 and would surface the moment anything reads `groupRoles` without
checking the admin flag.

**Ordering:** narrowing must precede the existing `requireSystemAdmin` and
`groupIdFrom`/`minimumRole` blocks at the end of `canActivate`, so those see the narrowed
map.

**Why this makes the change small.** The 105 `identityCanAccessGroup` and 13
`getIdentityGroupIds` call sites all read `groupRoles`. Narrowing upstream makes all 118
correct at once — list endpoints return the narrowed keys, by-ID endpoints don't find the
group and throw. Both are existing code paths behaving correctly on narrowed input.

Worked example, Alice (`REVIEWER` in A, `MEMBER` in B):

```
route needs documents.read   → { A: REVIEWER, B: MEMBER }   both survive layer 1
route needs documents.list   → { B: MEMBER }                A dropped
route needs group.manage     → {}                           403
```

Bob, reviewer-only:

```
route needs hitl.review      → { A: REVIEWER }
route needs documents.list   → {} and memberships exist  → 403
```

### 5.3 Boot-time capability coverage check — mandatory

Without a default bucket, a route missing `@RequireCapability` would 403 **everyone**,
members included. That failure must not be discoverable in production.

New `apps/backend-services/src/auth/capability-coverage.ts`, run in an
`OnApplicationBootstrap` hook: walk every registered route via Nest's `DiscoveryService`
/ `MetadataScanner`, and for each one assert that either `@Public()` or a
`@RequireCapability` (method- or class-level) is present. Throw listing every offender.

```
CapabilityCoverageError: 3 routes declare no capability and are not @Public:
  GET    /api/foo/bar          FooController.getBar
  POST   /api/foo/baz          FooController.createBaz
  DELETE /api/foo/:id          FooController.remove
```

This is not optional polish. It is the thing that makes D3 safe, and it converts the
worst failure mode in this design (silent lockout) into a failed startup in CI. A unit
test asserting the checker itself catches an unannotated route goes with it.

### 5.4 Endpoint annotation map

Class-level unless a handler differs. This is the full surface.

| Controller | Capability |
|---|---|
| `hitl.controller.ts` | class `hitl.review`; `@Get("analytics")` (`:388`) → `hitl.analytics` |
| `document.controller.ts` | `@Get()` (`:326`), `@Get("/stats")` (`:80`), `@Get("/thumbnails")` (`:110`) → `documents.list`; `@Get("/:documentId")` (`:192`), `/ocr` (`:454`), `/view` (`:550`), `/thumbnail` (`:631`), `/download` (`:683`) → `documents.read`; `@Patch` (`:231`), `@Post("/:documentId/approve")` (`:774`) → `documents.write`; `@Delete` (`:283`) → `documents.delete` |
| `upload.controller.ts` | `documents.write` |
| `ocr.controller.ts` | `ocr.run` |
| `workflow.controller.ts` | `workflows.manage` |
| `template-model.controller.ts` | `templates.manage` |
| `training.controller.ts` | `templates.train` |
| `tables.controller.ts` | class `tables.read`; row handlers → `tables.rows.write`; the 9 schema handlers (§1.4) → `tables.schema.manage` |
| `azure.controller.ts` | class `classifiers.manage`; `@Delete("classifiers/:groupId/:classifierName")` (`:669`) → `classifiers.delete` |
| `confusion-profile.controller.ts` | `confusionProfiles.manage` |
| `benchmark/*.controller.ts` (6 files) | `benchmark.manage` |
| `group.controller.ts` | class `group.read`; the 5 admin handlers (§1.4) → `group.manage`; `POST /` `createGroup` (`:332`) and `DELETE :groupId` `deleteGroup` (`:69`) keep `requireSystemAdmin: true` and take `group.manage` — the capability is there to satisfy the boot check, the system-admin flag is what actually gates them |
| `api-key.controller.ts` | `group.apikeys.manage` |
| `auth.controller.ts` | `@Get("me")` (`:288`) → `self`; the 4 `@Public()` routes unchanged |
| `client-error.controller.ts` | `self` — browser error reporting, `@Identity()` at `:26`, must stay reachable by every persona |
| `bootstrap.controller.ts` | **open question — see §10.7** |
| `health`, `metrics` | `@Public()`, exempt |

### 5.5 API-key path

`IdentityGuard` hardcodes `groupRoles = { [groupId]: GroupRole.MEMBER }` for API keys
(`:83`). Under D2 that grants the full member capability set — the status quo, unchanged
by this work. See §10.6 for why that is now more visible and what to do about it later.

---

## 6. Layer 2 — resource policies

### 6.1 The two shapes

Authorization against a *specific* object, and against a *set* of them, are different
operations and need different signatures:

```ts
// apps/backend-services/src/auth/policy/types.ts

/** Throws if this identity may not perform `capability` on this specific resource. */
export type AssertPolicy<TResource> = (
  identity: ResolvedIdentity,
  resource: TResource,
) => Promise<void>;

/**
 * Returns the constraint restricting a list query to what this identity may see.
 * `undefined` means "no constraint" (system admin) — same contract as
 * getIdentityGroupIds today, and easy to break. See §10.4.
 */
export type ScopePolicy<TWhere> = (
  identity: ResolvedIdentity,
) => Promise<TWhere | undefined>;
```

### 6.2 The default policy is what exists today

`identityCanAccessGroup(identity, resource.group_id)` **is** the default assert policy,
and `getIdentityGroupIds(identity)` **is** the default scope policy. They keep working
verbatim. A resource only needs a custom policy when it has a relationship the group map
cannot express — which today is exactly one resource: documents, for reviewers.

That is what keeps this migration finite. 105 call sites do not move; the ~11 in
`document.controller.ts` do.

### 6.3 The document policy

`apps/backend-services/src/document/document.policy.ts`:

```ts
/**
 * A reviewer may read a document they hold an open review session on, and nothing else.
 * Everyone else falls back to group membership.
 */
export async function assertCanReadDocument(
  identity: ResolvedIdentity,
  document: { id: string; group_id: string | null },
): Promise<void> {
  if (identity.isSystemAdmin) return;
  if (document.group_id === null) throw new NotFoundException("Resource not found.");

  const role = identity.groupRoles?.[document.group_id];
  if (role === undefined) {
    throw new ForbiddenException("User does not belong to requested group.");
  }

  // Roles that hold documents.list may read anything in the group.
  if (roleHasCapability(role, CAPABILITIES.DOCUMENTS_LIST)) return;

  // Otherwise the relationship must be explicit: an open session on this document.
  const holdsSession = await this.reviewDb.hasOpenSessionForActor(
    document.id,
    identity.actorId,
  );
  if (!holdsSession) {
    throw new ForbiddenException("No review session for this document.");
  }
}
```

`hasOpenSessionForActor` is a new db-service method on `ReviewDbService`:

```ts
// ReviewSession: document_id, actor_id, status (schema.prisma:485)
async hasOpenSessionForActor(documentId: string, actorId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? this.prisma;
  return (await client.reviewSession.count({
    where: { document_id: documentId, actor_id: actorId, status: ReviewStatus.in_progress },
  })) > 0;
}
```

Note the `documents.list` shortcut: rather than testing `role === MEMBER`, it asks a
capability question, so the policy stays correct when new roles appear. **Policies must
never switch on role names** — that reintroduces exactly the coupling this design removes.

`ReviewStatus.in_progress` is the right predicate: `approved`/`escalated`/`skipped`
sessions are finished, and a reviewer should lose access when they do. `DocumentLock`
(`schema.prisma:500`) with its `expires_at` is available if access should expire with the
lock rather than the session — decide during implementation; the session is the simpler
default and matches what the workspace does.

### 6.4 Where policies are called

Services, not controllers — consistent with the repo's existing layering. Controllers
keep resolving the resource and pass it down; the service asks the policy before acting.
Policies take `tx?: Prisma.TransactionClient` as the last parameter where they query, per
the project's db-service convention.

**Policies do not replace audit.** Every mutation still records an audit event per
`CLAUDE.md`; a policy denial is an authorization outcome, not an audit substitute.

---

## 7. Retiring `minimumRole` and `ROLE_ORDER`

Phase 3. Ordering is critical — see §10.1.

1. Delete the 22 no-op `minimumRole: GroupRole.MEMBER` sites (14 declarative, 8
   imperative). Behaviour-preserving; verified in §1.3.
2. Convert the 21 `ADMIN` gates to capability checks. All 21 are already covered by the
   §5.4 annotation map, so **they can simply be deleted** — the guard has already denied
   anyone without `group.manage` / `tables.schema.manage` / `group.apikeys.manage` /
   `classifiers.delete` before the handler runs.
3. Delete `minimumRole` from `IdentityOptions` (`identity.decorator.ts:43`) and its
   enforcement block (`identity.guard.ts:167-178`).
4. Delete the third parameter of `identityCanAccessGroup` and the `ROLE_ORDER` comparison
   (`identity.helpers.ts:87`, `:112`).
5. Delete `role-order.ts`.

`requireSystemAdmin` survives untouched (D6).

---

## 8. Frontend

### 8.1 `/api/auth/me` returns effective capabilities (D7)

`MeResponseDto.groups[]` gains `capabilities: string[]` — the capability set for that
group's role, computed server-side from `ROLE_CAPABILITIES`. One source of truth; the
frontend stops guessing.

`GroupService.getUserGroups` short-circuits on `identity.userId === userId` and reads
memberships from the database (`group.service.ts:110-115`) rather than from `groupRoles`,
so narrowing does not affect this payload and a reviewer still sees all their groups in
the selector.

### 8.2 `useCapabilities`

```ts
// apps/frontend/src/auth/useCapabilities.ts
export function useCapabilities() {
  const { isSystemAdmin } = useAuth();          // exported from AuthContext.tsx
  const { activeGroup } = useGroup();           // GroupContext.tsx:40
  const caps = new Set(activeGroup?.capabilities ?? []);
  return {
    can: (c: string) => isSystemAdmin || caps.has(c),
  };
}
```

Per D3, the answer is group-dependent: Alice sees the full app while Team B is active and
only review while Team A is.

`AuthContext.tsx:20` widens `role?: "ADMIN" | "MEMBER"` to include `"REVIEWER"`, and
`GROUP_ROLE_OPTIONS` (`useGroups.ts:28`) gains the third entry or the role cannot be
assigned from the UI. `GroupsPage.test.tsx` and `GroupDetailPage.test.tsx` mock it.

### 8.3 Navigation and routes

Nav items become capability-driven rather than role-driven — each entry declares the
capability it needs and `RootLayout` filters on `can()`:

| Nav item | Capability |
|---|---|
| Upload | `documents.write` |
| Documents | `documents.list` |
| Template Models | `templates.manage` |
| Tables | `tables.read` |
| HITL Review | `hitl.review` |
| Workflows | `workflows.manage` |
| Classify | `classifiers.manage` |
| Groups | `group.read` |
| Confusion Profiles | `confusionProfiles.manage` |
| Benchmarking section (`:124`) | `benchmark.manage` |
| Settings (`:303` and `:325-342`) | `group.apikeys.manage` |

**Settings needs two edits, not one** — it is not in `navItems`; it is hand-written markup
in both the expanded (`:303`) and collapsed (`:325-342`) sidebars.

Routes: add a `CapabilityRoute` wrapper alongside `NoGroupGuard`
(`apps/frontend/src/auth/NoGroupGuard.tsx` is the pattern — same `isLoading → null`
shape) that redirects to the first nav item the user *can* reach when they lack the
capability for the requested route. `{ index: true }` (`App.tsx:55`) renders `UploadPage`,
which a reviewer cannot use, so the index redirect follows the same rule.

`ReviewWorkspacePage` is mounted twice — also at
`benchmarking/datasets/:id/versions/:versionId/review/:sessionId` (`App.tsx:103`). That
mount requires `benchmark.manage`, so reviewers redirect away from it. Confirm that is
intended.

**Fix the silent swallow.** `ReviewWorkspacePage.tsx:272` (`if (!response.ok || revoked)
return`) and the bare `catch` at `:278-280` drop document-load failures, rendering a blank
canvas with no error. That is what made the v1 gap invisible, and it should render an
error state regardless of which authorization model ships.

---

## 9. Delivery phases

Sequenced so the app is never broken and **Reviewer ships at the end of Phase 1**, not
after the whole migration.

### Phase 1 — the model, plus Reviewer *(feature lands here)*

- `capabilities.ts`, derived `ROLE_CAPABILITIES`, `@RequireCapability`.
- Guard narrowing (§5.2), with `DEFAULT_CAPABILITY = "legacy.access"` **temporarily** in
  `ADMIN` and `MEMBER` but not `REVIEWER`. Unannotated routes behave exactly as today.
- Annotate `hitl`, `document`, `upload`, `auth`, `client-error`.
- `REVIEWER` enum value + migration; policy layer types; `assertCanReadDocument`;
  `hasOpenSessionForActor`.
- Frontend: `/me` capabilities, `useCapabilities`, nav + route filtering.

At the end of Phase 1 the Reviewer role works end to end, including the document canvas,
with no bespoke endpoint.

### Phase 2 — annotate the rest

- The remaining ~18 controllers per §5.4.
- `capability-coverage.ts` in **warn** mode, then **fail** mode.
- Delete `legacy.access`. D3 is now real.

### Phase 3 — retire the ladder

- §7, in order. The 22 no-ops, then the 21 gates, then `minimumRole`, then `ROLE_ORDER`.

### Phase 4 — separate the conflated admin tiers

- Now that `tables.schema.manage` and `group.manage` are distinct capabilities, decide
  whether a "data curator" role is wanted. §1.4 says the product already implies one.
  Out of scope for this document; the mechanism will be waiting.

---

## 10. Gotchas

The list to read before starting.

### 10.1 Phase 3 has an ordering trap that can open access

`identityCanAccessGroup`'s third parameter **has a default of `MEMBER`**. Deleting it
turns 84 two-arg call sites from "MEMBER floor" into "no floor". That is correct *only if*
every one of those routes already carries a capability. So: **do not touch `minimumRole`
or `ROLE_ORDER` until `capability-coverage.ts` is in fail mode and green.** Phase 3 after
Phase 2, without exception. Doing them in the other order silently widens access on
routes whose annotation was forgotten.

### 10.2 No wildcard means a forgotten decorator locks out *everyone*

v1's `general.access` default meant a forgotten annotation was harmless for members. Here
it 403s them. That is the deliberate trade for being able to express privilege
capabilities at all — but it makes §5.3's boot check load-bearing, not optional. Ship the
checker in Phase 2 before deleting `legacy.access`, never after.

### 10.3 Any-of is right for scope and wrong for privilege

`@RequireCapability(a, b)` passes on either. That suits scope ("reviewer *or* analyst").
It does **not** express "must hold `documents.write` **and** `tables.schema.manage`". No
route needs all-of today. If one ever does, add a separate `@RequireAllCapabilities`
rather than overloading the existing decorator — silently changing any-of to all-of would
break every existing call site in a way tests may not catch.

### 10.4 `undefined` means "no filter" and is easy to break

`getIdentityGroupIds` returns `undefined` for system admins, and callers skip the group
`where` clause entirely. A `ScopePolicy` that returns `{}` or `[]` instead of `undefined`
for an admin silently filters them to nothing; one that returns `undefined` for a
*non*-admin silently shows them everything. Type the return as
`TWhere | undefined` and test both directions per policy.

### 10.5 Policies must not switch on role names

`if (role === GroupRole.MEMBER)` inside a policy reintroduces the coupling this design
removes, and breaks the day a fourth role appears. Ask capability questions
(`roleHasCapability(role, DOCUMENTS_LIST)`), as §6.3 does.

### 10.6 API keys silently get the full member capability set

`IdentityGuard` hardcodes `MEMBER` for API keys (`:83`), so under D2 a key holds every
non-admin capability — `documents.delete`, `workflows.manage`, everything. That is exactly
today's behaviour, so this design changes nothing, but it is now *legible* in a way it was
not before, and it will look wrong to a reviewer of this work. Scoping API keys to a
capability subset is a real improvement and explicitly **out of scope** here; note it and
move on.

### 10.7 `bootstrap.controller.ts` has no group gate at all

`@Controller("api/bootstrap")` (`:24`) exposes `GET status` (`:39`) and `POST /` (`:63`),
both `@Identity()` with no `groupIdFrom`, no `minimumRole`, and no
`requireSystemAdmin`. The `@ApiForbiddenResponse` on the POST suggests it checks
internally, but the guard does not.

**This is an open question for the implementer, not something to guess at.** The boot
check will force a decision. Read the handler, determine whether bootstrap is meant to be
system-admin-only, and annotate accordingly — very likely `requireSystemAdmin: true` plus
`group.manage`. Flag it to the product owner if the answer isn't obvious from the code;
it may be a pre-existing hole unrelated to this work.

### 10.8 Restricted roles are not subsets of `MEMBER`

`REVIEWER` happens to be one, so it is tempting to write helpers assuming
`REVIEWER ⊆ MEMBER`. Don't. A future role could hold a capability `MEMBER` lacks (a HITL
supervisor with `hitl.escalate`, say). Nothing in `ROLE_CAPABILITIES` or the guard assumes
subsetting — keep it that way.

### 10.9 `documents.read` alone does not scope a list

The reviewer's document access works because `documents.list` and `documents.read` are
separate capabilities. If someone later merges them "for simplicity", reviewers
immediately see the entire group corpus. The `capabilities.spec.ts` assertion that
`REVIEWER` lacks `documents.list` is the guard against that, and its comment should say
why.

### 10.10 Enum value in a migration

PostgreSQL before 12 cannot run `ALTER TYPE … ADD VALUE` in a transaction block; 12+ allows
it provided the value is not *used* in the same transaction. This migration only adds the
value, so it is fine on 12+. Latest migration on `develop` is
`20260626000000_add_documents_list_indexes`, so a `20260730000000_` prefix sorts correctly.
Run `npm run db:generate` from `apps/backend-services` — never `npx prisma generate`.

### 10.11 Existing specs assert on `groupRoles`

`testFactory.makeIdentity` types `groupRoles` as `Record<string, $Enums.GroupRole>`. Specs
that assert on its contents will break once the guard narrows. Expect that to be the bulk
of the test churn, and treat each break as a question ("should this identity still see
that group?") rather than a mechanical fix.

---

## 11. Tests

Spec files sit next to their source, per repo convention.

**`auth/capabilities.spec.ts`** (new)
- `MEMBER` = `ALL \ ADMIN_ONLY`, asserted by set comparison, so a capability added to
  neither list fails loudly.
- `ADMIN ⊇ MEMBER` — iterate `MEMBER`, assert each is in `ADMIN`.
- `ADMIN_ONLY` capabilities are absent from `MEMBER`.
- `REVIEWER` holds `hitl.review` and `documents.read`.
- `REVIEWER` does **not** hold `documents.list` — with a comment pointing at §10.9.
- `REVIEWER` does not hold `hitl.analytics`.
- Every role holds `self`.
- `roleHasAnyCapability` — true on partial match, false on none.

**`auth/capability-coverage.spec.ts`** (new)
- A stub controller with an unannotated, non-`@Public` route makes the checker throw, and
  the message names the route.
- `@Public()` and class-level-annotated routes pass.

**`auth/identity.guard.spec.ts`** (extend)
- Reviewer-only, route needs `documents.list` → 403.
- Reviewer-only, route needs `hitl.review` → passes, group present.
- Member, route needs `hitl.review` → passes. (Members must not lose HITL.)
- Mixed Alice, `documents.list` → only the MEMBER group survives.
- Mixed Alice, `documents.read` → both groups survive.
- System admin → never narrowed.
- System admin who is also `REVIEWER` in a group, route needs `documents.list` → that
  group is still present. (The `!is_system_admin` wrapper, §5.2.)
- Zero memberships → unchanged; no hard deny, `/request-membership` still reachable.
- Method-level overrides class-level.
- Two-capability route → a role holding either survives.
- API-key request → unchanged.

**`document/document.policy.spec.ts`** (new)
- Reviewer with an `in_progress` session on the document → allowed.
- Reviewer with an `approved`/`escalated`/`skipped` session → denied.
- Reviewer with a session on a *different* document → denied.
- Member in the group, no session → allowed (via `documents.list`).
- System admin → allowed.
- `group_id === null` → `NotFoundException`, not `Forbidden` (preserves the existing
  orphan-record behaviour in `identity.helpers.ts`).

**`hitl/hitl.controller.spec.ts`** (extend)
- A reviewer reaches the queue, opens a session, submits corrections. Assert on at least
  one queue endpoint (line 68 path) and one session-mutation endpoint (line 226 path) —
  they reach the check by different routes.

**`document/document.controller.spec.ts`** (extend) — *the regression that matters most*
- A reviewer holding a session `GET`s `/api/documents/:id/view` → 200.
- The same reviewer `GET`s `/api/documents` → their group is narrowed away.
- **Nothing else in this list would catch a broken canvas** — every HITL endpoint answers
  200 while the page renders blank. Do not ship without it.

**Frontend**
- `RootLayout.test.tsx` — reviewer active group renders one nav item, no Settings.
- `CapabilityRoute` test mirroring `NoGroupGuard.test.tsx`.
- `ReviewWorkspacePage` — document fetch fails → error state renders (§8.3).

**Integration**
- One test per major module (documents, workflows, template-models, tables) asserting a
  reviewer gets 403 on a by-ID read and an empty list on a list endpoint.

Run backend tests from `apps/backend-services` and fix what breaks; see §10.11 for the
expected shape of the churn.

---

## 12. Documentation

Per `CLAUDE.md`, docs live in the matching `docs-md/` topic folder; the `docs-sync` skill
has the workflow.

- `docs-md/auth/GROUP_RESOURCE_AUTHORIZATION.md` — substantially rewritten. Its
  "Enforcement Location" section describes two mechanisms; there are now two *layers* with
  a different relationship, and `minimumRole` is gone.
- `docs-md/auth/AUTHENTICATION.md` — the role list and the capability vocabulary.
- `docs-md/groups/ASSIGN_USERS_TO_GROUPS.md`, `GROUP_DETAIL_PAGE.md` — the new role in the
  member dropdown and what it means.
- `apps/backend-services/src/auth/README.md` — module description, both layers.
- **New** `docs-md/auth/CAPABILITIES.md` — the vocabulary, the derivation rule, and how to
  add a capability. This is the page people will look for.

Swagger: annotated controllers gain `@ApiForbiddenResponse` describing capability denial,
with dedicated DTOs referenced via `type`, per the project's controller documentation rule.

---

## 13. Out of scope

- Capabilities stored as data, or assignable independently of a role (D5).
- Capability-scoped API keys (§10.6).
- Any change to `is_system_admin` (D6).
- A data-curator role separating `tables.schema.manage` from `group.manage` — the
  mechanism lands here, the product decision does not (Phase 4).
- Finer-grained HITL permissions (`hitl.escalate`, `hitl.reopen`) — the vocabulary has
  room; no persona needs them yet.
- The analytics dashboard itself.

---

## 14. Files touched

**New**
- `apps/backend-services/src/auth/capabilities.ts` (+ spec)
- `apps/backend-services/src/auth/capability.decorator.ts`
- `apps/backend-services/src/auth/capability-coverage.ts` (+ spec)
- `apps/backend-services/src/auth/policy/types.ts`
- `apps/backend-services/src/document/document.policy.ts` (+ spec)
- `apps/shared/prisma/migrations/20260730000000_add_reviewer_group_role/migration.sql`
- `apps/frontend/src/auth/useCapabilities.ts`
- `apps/frontend/src/auth/CapabilityRoute.tsx` (+ test)
- `docs-md/auth/CAPABILITIES.md`

**Modified**
- `apps/shared/prisma/schema.prisma` — one enum value
- `apps/backend-services/src/auth/identity.guard.ts` — narrowing block (§5.2); later the
  `minimumRole` block deleted (§7)
- `apps/backend-services/src/auth/identity.decorator.ts` — `minimumRole` removed (Phase 3)
- `apps/backend-services/src/auth/identity.helpers.ts` — third parameter removed (Phase 3)
- All 23 controllers — one decorator each, a few with method-level overrides (§5.4)
- `apps/backend-services/src/hitl/review-db.service.ts` — `hasOpenSessionForActor`
- `apps/backend-services/src/group/group.service.ts` + `MeResponseDto` — capabilities on
  `/me` (§8.1)
- `apps/frontend/src/auth/AuthContext.tsx:20` — role union + `capabilities`
- `apps/frontend/src/data/hooks/useGroups.ts:28` — `GROUP_ROLE_OPTIONS`
- `apps/frontend/src/layouts/RootLayout.tsx` — nav filtering (`:64`, `:124`) and both
  Settings links (`:303`, `:325-342`)
- `apps/frontend/src/App.tsx` — `CapabilityRoute` + index redirect (`:55`, `:84-85`)
- `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` — error state
  on document-load failure (`:261`, `:268`)
- docs per §12

**Deleted (Phase 3)**
- `apps/backend-services/src/auth/role-order.ts`
- 22 no-op `minimumRole: GroupRole.MEMBER` sites
- 21 `ADMIN` gates, superseded by capability annotations
