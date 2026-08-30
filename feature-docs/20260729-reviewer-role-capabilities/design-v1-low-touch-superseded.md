# Restricted roles: Reviewer, via role → capability mapping

**Status:** design, ready for implementation
**Date:** 2026-07-29
**Goal:** a `REVIEWER` group role whose holders can reach the HITL review queue and workspace and nothing else, built so that a future analytics-only role costs one enum value and one line in a map.

**Baseline:** every file:line reference and every call-site count in this document is
against **`develop`**, not any feature branch. Re-derive them if `develop` has moved.

---

## The approach in brief

*Plain-language summary. Everything below this section is the detailed version.*

### What we want

Some people should be able to open the HITL review queue, correct documents, and do
nothing else in the app. No documents list, no workflows, no template models. Today
there is no way to express that: you are either an `ADMIN` or a `MEMBER` of a group, and
`MEMBER` means "full access".

### Why the obvious fix doesn't work

The obvious fix is to add a third rung below `MEMBER` on the existing privilege ladder —
`REVIEWER < MEMBER < ADMIN` — and let the existing "you must be at least a MEMBER" checks
turn reviewers away.

That fails for two reasons.

**It locks reviewers out of the thing they exist to do.** Almost every authorization
check in the codebase silently applies a "must be at least a MEMBER" floor, because
that is the *default argument* of the helper everyone calls. The HITL controller itself
makes 14 such calls. A role ranked below `MEMBER` fails all of them, so a reviewer
couldn't open the review queue.

**A ladder can't describe the next role.** A ladder puts everything in one line, most
privileged to least. But a future analytics-only role isn't *more* or *less* privileged
than review-only — it's sideways. Two restricted roles that each see a different slice of
the app can't be arranged on a single line at all. Better to stop using the ladder for
this now, while there's only one such role.

### The idea

Every authorization check in the app — all 118 of them, both the declarative decorators
and the imperative helper calls — ultimately reads one thing: a map on the request that
says *which groups is this user in, and with what role*.

```
groupRoles = { "team-a": REVIEWER, "team-b": MEMBER }
```

So instead of teaching 118 call sites about a new role, we edit that map **once**, in the
one guard that builds it, before any of them see it.

Each handler declares what it's for — `hitl.review`, or nothing, which means "ordinary
app access". The guard looks at what the handler needs, then **removes from the map any
group whose role doesn't grant it**. Every downstream check then behaves correctly
without being changed, because as far as it can tell the user simply isn't in that group.

There is no list of "endpoints a reviewer may call" anywhere. Two small mappings meet in
the middle, and the vocabulary between them is three strings:

```
ROLE          →  CAPABILITIES              (a const in capabilities.ts)
  ADMIN       →  general.access, self       ← general.access means "unrestricted";
  MEMBER      →  general.access, self          it satisfies every capability there is
  REVIEWER    →  hitl.review,    self

ENDPOINT      →  CAPABILITIES IT ACCEPTS   (the @RequireCapability decorator)
  /api/hitl/*           →  hitl.review
  /api/auth/me          →  self
  everything else       →  general.access   ← by default; no decorator needed
```

### Two things that are easy to get backwards

**`@RequireCapability` is a grant, not a restriction.** Tagging the HITL controller with
`hitl.review` does *not* make it reviewer-only. **Members and admins keep full HITL
access**, because `general.access` satisfies every capability. The restriction runs from
the opposite direction: `REVIEWER` has no `general.access`, so everything a handler
doesn't explicitly open stays shut to them. The decorator punches a hole in default-deny;
it never builds a wall.

**`general.access` is a wildcard on purpose.** Ordinary members and admins pass any
capability check, including capabilities invented years from now. That means adding a new
feature capability never requires editing `ADMIN` or `MEMBER` — which is exactly the edit
people forget, and forgetting it would silently lock ordinary users out of a feature.

### What that looks like for a real user

Alice is a `REVIEWER` in Team A and a `MEMBER` in Team B.

| She requests | Handler needs | Map she gets | Result |
|---|---|---|---|
| The review queue | `hitl.review` | `{ A: REVIEWER, B: MEMBER }` | Sees both teams' review work |
| The documents list | ordinary access | `{ B: MEMBER }` | Sees only Team B's documents |
| A Team A document by ID | ordinary access | `{ B: MEMBER }` | 403 — A isn't in her map |

And for Bob, who is a `REVIEWER` and nothing else: on any ordinary-access handler his map
empties completely. That's the signal that he has memberships but none of them permit
this request, so the guard returns 403 outright.

### Why this is the safe default

The rule is **deny unless the handler says otherwise**. A handler that declares nothing
gets "ordinary app access", which restricted roles don't have. So an endpoint added six
months from now refuses reviewers automatically — nobody has to remember to protect it.
(§2 is precise about the limits of that guarantee.)

### What it costs

- One new enum value, `REVIEWER`, and a one-line migration.
- A small map in code saying which role grants which capability — not a database table,
  not a management UI, because there are two restricted personas in view and a
  ten-line map covers both and can be tested exhaustively.
- One block inside `IdentityGuard`.
- Three decorators and one new HITL endpoint, plus nav and route filtering in the frontend.

No changes to the 105 `identityCanAccessGroup` call sites or the 13 `getIdentityGroupIds`
call sites.

### The one thing that isn't clean

The review screen doesn't only call HITL endpoints — it loads the document image from
`DocumentController`, which reviewers are narrowed out of. Left alone, a reviewer gets a
working queue and a blank canvas, silently. §4.4.1 covers this: the fix is a new
HITL-scoped endpoint that serves the file for a session the reviewer actually holds,
rather than opening up the whole documents controller.

### What it buys later

Adding the analytics-only role becomes: one enum value, one line in the map, one
decorator on the analytics controller, one branch in the frontend. No guard change, no
helper change, and no edit to `ADMIN` or `MEMBER` — the wildcard means they pick up the
new capability for free.

---

## 1. How authorization works today

Two axes, no more.

| Axis | Where | Values |
|---|---|---|
| Global admin | `user.is_system_admin` (`apps/shared/prisma/schema.prisma:138`) | boolean |
| Per-group role | `user_group.role` (`schema.prisma:430`), enum `GroupRole` (`schema.prisma:841`) | `ADMIN`, `MEMBER` |

`GroupRole` is compared as a **linear ladder** through `ROLE_ORDER` in
`apps/backend-services/src/auth/role-order.ts` (`MEMBER: 0`, `ADMIN: 1`).

Enforcement happens at the HTTP boundary in two flavours, documented in
`docs-md/auth/GROUP_RESOURCE_AUTHORIZATION.md`:

1. **Declarative** — `@Identity({ groupIdFrom, minimumRole })`, enforced by
   `IdentityGuard.canActivate` (`apps/backend-services/src/auth/identity.guard.ts`).
2. **Imperative** — `identityCanAccessGroup(identity, groupId, minimumRole?)` and
   `getIdentityGroupIds(identity)` from `apps/backend-services/src/auth/identity.helpers.ts`,
   called from controllers (and a few services).

Both read the same thing: `request.resolvedIdentity.groupRoles`, a
`Record<groupId, GroupRole>` that `IdentityGuard` populates from the database on the
JWT path, or from the single scoped group on the API-key path.

### The constraint that shapes this design

**There is already a pervasive `MEMBER` floor.** This is the single most important fact
for anyone implementing this, and it is easy to miss:

```ts
// identity.helpers.ts:84-88 — note the default
export function identityCanAccessGroup(
  identity: ResolvedIdentity | undefined,
  groupId: string | null,
  minimumRole: GroupRole = GroupRole.MEMBER,   // <-- not "membership only"
): void
```

…and the body enforces `if (ROLE_ORDER[role] < ROLE_ORDER[minimumRole]) throw`. So
**every one of the 105 non-test call sites applies a `MEMBER` floor**, including the 84
that pass only two arguments. Explicit role requirements on top of that:

| Path | `ADMIN` | `MEMBER` |
|---|---|---|
| Declarative `minimumRole:` | 8 | 14 |
| Imperative 3-arg `identityCanAccessGroup` | 13 | 8 |

Additionally, **all but one** declarative `@Identity({ groupIdFrom })` site passes
`minimumRole`. The single exception is `benchmark/dataset.controller.ts:89-92`
(`@Post()` create-dataset), which resolves the group but sets no floor. It does not
change anything below — that handler declares no capability either, so a reviewer's
group is dropped by narrowing (§4.2) before the floor would have mattered.

The consequence is the opposite of what a first pass suggests. A restrictive role
cannot be delivered by adding a rung *below* `MEMBER`, not because the ladder is too
weak, but because **it is too blunt**: `hitl.controller.ts` itself makes 14 two-arg
`identityCanAccessGroup` calls (lines 68, 123, 150, 173, 193, 226, 245, 274, 297, 316,
336, 357, 383, 402), each carrying the `MEMBER` floor. A `REVIEWER` ranked below
`MEMBER` would be denied **the review queue itself** — the one thing the role exists to
do. Fixing that by hand means editing those 14 call sites to pass a lower floor, which
then has to be repeated for every future restricted role.

What the ladder genuinely *cannot* cover, at any ranking, is
`getIdentityGroupIds` — it returns `Object.keys(identity.groupRoles)` with **no role
comparison at all**. Its 13 non-test call sites are the list endpoints, so a reviewer
would see every document, workflow, and template model in their groups regardless of
where the role sits on the ladder.

**So the design question is not roles-vs-capabilities, and not where the role ranks. It
is where the default-deny lives.** This design puts it in one place — `IdentityGuard` —
and has it act on `groupRoles` itself, which is the one input *both* mechanisms read.

That single-chokepoint claim is load-bearing, so it was checked directly: outside
`apps/backend-services/src/auth/`, **nothing reads `identity.groupRoles`** except
`testUtils/testFactory.ts`, which only types it. There is no third consumer to keep in
step, and no WebSocket or SSE gateway with its own identity path.

### Frontend today

- `apps/frontend/src/App.tsx` — every route is reachable by any authenticated user
  who passes `NoGroupGuard` (which only checks "has at least one group").
- `apps/frontend/src/layouts/RootLayout.tsx:64` — `navItems` is a static array
  rendered for everyone; `benchmarkingNavItems` (`:124`) likewise. **Settings is not in
  `navItems`** — it is hand-written `NavLink`/`ActionIcon` markup at `:303` (expanded
  sidebar) and `:325-342` (collapsed sidebar), so filtering the array will not hide it.
- `isSystemAdmin` from `useAuth()` gates a handful of buttons only
  (`GroupsPage`, `GroupDetailPage`, `TablesListPage`, `TableDetailPage`,
  `ClassifierDetails`).
- The group selector reads `user.groups` off the `/api/auth/me` payload
  (`AuthContext.tsx` → `GroupContext.tsx:40`), so switching groups costs no extra request.

### HITL surface to be preserved

- Backend: `apps/backend-services/src/hitl/hitl.controller.ts:50`, `@Controller("api/hitl")`,
  14 endpoints, all currently `@Identity({ allowApiKey: true })` with no role requirement.
- Frontend: `/review` (`ReviewQueuePage`) and `/review/:sessionId` (`ReviewWorkspacePage`),
  `App.tsx:84-85`.
- **The review workspace is not HITL-only.** `ReviewWorkspacePage.tsx:261` and `:268`
  fetch the page image straight from `DocumentController` —
  `GET /api/documents/:id/view`, falling back to `GET /api/documents/:id/download`
  (`document.controller.ts:550` and `:683`, both gated by `identityCanAccessGroup` at
  `:584` and `:716`). Any design that narrows a reviewer out of `DocumentController`
  therefore breaks the canvas. See §4.4.1 — this is the one place the "annotate HITL and
  nothing else" story does not hold.

---

## 2. Decisions taken

| # | Decision | Rationale |
|---|---|---|
| D1 | Reviewer is a **per-group role**, on `UserGroup.role` | Fits the existing model; a person can be a reviewer for one team without that being a property of the human. |
| D2 | **Real boundary**, default-deny | A Reviewer typing `/workflows` or curling `/api/documents` must be refused, and endpoints added later must be refused without anyone remembering to annotate them. |
| D3 | Mixed membership is **capability-scoped per group** | Alice as `REVIEWER` in A and `MEMBER` in B gets the full app for B's data and reaches A's data only through HITL. |
| D4 | Roles remain the **assignable unit**; capabilities are what **code checks**; the mapping is a **const in code**, not a table | Extensibility of capabilities with none of the cost — no capability schema, no management UI, no incoherent combinations. The map is a seam: swapping it for a DB lookup later changes no call site. |
| D5 | Document bytes a reviewer needs are served by a **new HITL-scoped endpoint**, not by relaxing `DocumentController` | Keeps D2 honest. The alternative — tagging `GET /documents/:id/view`, `/download`, `/thumbnail` with `hitl.review` — would let a reviewer read *any* document in the group by ID, not just ones in their queue. See §4.4.1. |

### What default-deny does and does not buy

Worth being precise, because it is easy to over-trust. Narrowing guarantees denial in
two cases: a **reviewer-only** user on any handler that declares no capability (the hard
deny in §4.2 fires regardless of what the handler does), and **any** user on a handler
that consults `groupRoles` via either helper.

It does **not** protect a mixed-membership user on a *new* endpoint that performs no
group check at all — narrowing cannot filter what nothing consults. So D2's "endpoints
added later must be refused without anyone remembering to annotate them" is exactly true
for reviewer-only users and conditional on existing group checks for everyone else. That
is a strict improvement on today, not a total boundary.

### Why not keep adding roles to the ladder

Two independent reasons.

**It breaks HITL.** Per §1, ranking `REVIEWER` below `MEMBER` denies it the 14
`MEMBER`-floor checks inside `hitl.controller.ts`. The role would be unable to review.

**It cannot express the next role.** `ROLE_ORDER` is a total order. A future
analytics-only role is neither more nor less privileged than review-only — it is
*different*. A numeric ladder cannot represent two incomparable restricted roles, so
the ladder has to stop being the mechanism now, while there is only one of them.

### Why not capabilities as data

Capabilities in the database mean a migration, CRUD endpoints, a management UI, and the
ability for an admin to assemble a combination nobody designed for or tested. There are
two restricted personas in view (Reviewer now, Analyst later). A ten-line map covers
both and is exhaustively testable.

---

## 3. Target model

### 3.1 Schema

One new enum value. That is the entire migration.

```prisma
enum GroupRole {
  ADMIN
  MEMBER
  REVIEWER
}
```

### 3.2 Capabilities

New file `apps/backend-services/src/auth/capabilities.ts`. There is exactly one
functional capability today — `general.access` is the unrestricted-user marker and `self`
is the login escape hatch.

```ts
import { GroupRole } from "@generated/client";

/** Coarse permission checked by IdentityGuard. Not stored — derived from GroupRole. */
export type Capability = "general.access" | "hitl.review" | "self";

/**
 * Capabilities granted by each group role.
 *
 * `general.access` means "unrestricted app user" and subsumes every feature
 * capability — see roleHasCapability. So ADMIN and MEMBER never need to be edited
 * when a feature capability is added; only restricted roles list capabilities
 * individually.
 *
 * Adding a restricted role = one entry here + one @RequireCapability() on its controller.
 */
export const ROLE_CAPABILITIES = {
  [GroupRole.ADMIN]: ["general.access", "self"],
  [GroupRole.MEMBER]: ["general.access", "self"],
  [GroupRole.REVIEWER]: ["hitl.review", "self"],
} as const satisfies Record<GroupRole, readonly Capability[]>;

/** Capability required by a handler that declares none. Default-deny lives here. */
export const DEFAULT_CAPABILITY: Capability = "general.access";

export function roleHasCapability(
  role: GroupRole,
  capability: Capability,
): boolean {
  const held = ROLE_CAPABILITIES[role] as readonly Capability[];
  // Unrestricted users pass every capability check, including ones added later.
  return held.includes("general.access") || held.includes(capability);
}

/** True when the role grants ANY of the capabilities a handler will accept. */
export function roleHasAnyCapability(
  role: GroupRole,
  capabilities: readonly Capability[],
): boolean {
  return capabilities.some((c) => roleHasCapability(role, c));
}
```

**`@RequireCapability` is a grant, not a restriction.** This trips people up, so say it
out loud: tagging a handler `hitl.review` does *not* make it reviewer-only. It opens the
handler to everyone holding `hitl.review`, which — via the `general.access` wildcard — is
every ordinary member and admin as well. **Members and admins keep full HITL access.**
The restriction runs the other way entirely: `REVIEWER` does not hold `general.access`,
so every handler that declares nothing is closed to them. The decorator punches a hole in
default-deny; it never builds a wall.

The corollary is that you cannot express "members must not reach this, but reviewers
must". That is deliberate — a member is a superset persona. Endpoints that genuinely need
to exclude ordinary members are admin-only, which `requireSystemAdmin` and
`minimumRole: GroupRole.ADMIN` already handle.

`self` is held by every role and is what makes a reviewer-only user able to log in
(see §4.4). It is not a group-scoped permission; it marks routes that must survive
narrowing.

**Be honest about what `self` is.** Because every role holds it, the narrowing loop is a
no-op for it — functionally it is an *exemption marker*, not a capability, and it only
lives in `ROLE_CAPABILITIES` so that the guard needs one code path instead of two. The
invariant that makes it work ("every role holds `self`") is enforced by a test in §6, not
by the type. Unrestricted roles get it for free via the `general.access` wildcard, so the
risk is confined to **restricted** roles: add one without `self` and its holders are
locked out at `/me` and cannot log in at all. Listing it explicitly on `ADMIN` and
`MEMBER` is therefore redundant, and kept only so the map reads as a complete statement
of what each role has. If any of this ever feels fragile, replace `self` with a
`@SkipCapabilityCheck()` decorator and delete it from the `Capability` union; nothing else
depends on it.

### 3.3 `ROLE_ORDER` — REVIEWER sits at MEMBER's tier, *not* below it

```ts
export const ROLE_ORDER: Record<GroupRole, number> = {
  [GroupRole.MEMBER]: 0,
  [GroupRole.REVIEWER]: 0,   // same tier as MEMBER — deliberate, see below
  [GroupRole.ADMIN]: 1,
};
```

**Read §1 before changing this.** The tempting move is to rank `REVIEWER` below
`MEMBER` as a free second lock. It is not a second lock — it is a bug. The 14
`MEMBER`-floor checks inside `hitl.controller.ts` would deny reviewers the review queue.

Giving `REVIEWER` the same tier as `MEMBER` means the ladder is **silent** about
restricted roles, and capability narrowing (§4.2) is the sole restriction mechanism:

- HITL — handler declares `hitl.review`, the group survives narrowing, the `MEMBER`
  floor passes, the reviewer works.
- Documents — handler declares nothing, the group is dropped by narrowing,
  `identityCanAccessGroup` never sees it, 403.

One mechanism instead of two that half-overlap. `ROLE_ORDER` keeps its original and only
real job: admin-vs-not. Future restricted roles also sit at `0`; do not add a rung per
role.

---

## 4. Backend changes

### 4.1 `@RequireCapability()` decorator — new

New file `apps/backend-services/src/auth/capability.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";
import type { Capability } from "./capabilities";

export const CAPABILITY_KEY = "capability";

/**
 * Declares the capabilities a handler (or every handler on a controller) accepts.
 * A group passes if its role grants ANY of them. Handlers that declare nothing
 * require DEFAULT_CAPABILITY, so restricted roles are denied by default.
 */
export const RequireCapability = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITY_KEY, capabilities);
```

The decorator is `RequireCapability`, not `Capability` — the latter is already the
type name in `capabilities.ts`, and a value and a type with the same identifier imported
into the same file collide.

**Variadic, with any-of semantics.** One capability is all any handler needs today, and
`@RequireCapability("hitl.review")` reads exactly as before. The variadic form exists for
the case where two *restricted* roles need the same endpoint — a reviewer and an analyst
both wanting one report, say — which single-capability cannot express without giving one
of them a capability that means something else. Ordinary members and admins never need
listing, because `general.access` already subsumes everything (§3.2).

Resolved with `reflector.getAllAndOverride(CAPABILITY_KEY, [handler, class])`, the same
pattern `IdentityGuard` already uses for `IDENTITY_KEY` — a method-level decorator
overrides a class-level one.

### 4.2 `IdentityGuard` — narrow, then deny

In `identity.guard.ts`, on the JWT path, immediately after `groupRoles` is built from
`user.userGroups`, and **before** `resolvedIdentity` is assigned:

```ts
const required =
  this.reflector.getAllAndOverride<Capability[] | undefined>(
    CAPABILITY_KEY,
    [context.getHandler(), context.getClass()],
  ) ?? [DEFAULT_CAPABILITY];

// System admins are never narrowed — see the note below. `permitted` stays
// identical to `groupRoles` for them.
let permitted = groupRoles;

if (!user.is_system_admin) {
  // Narrowing: keep only groups whose role grants one of the required capabilities.
  permitted = {};
  for (const [groupId, role] of Object.entries(groupRoles)) {
    if (roleHasAnyCapability(role, required)) permitted[groupId] = role;
  }

  // Hard deny: the user has memberships, but none of them permit this handler.
  if (
    Object.keys(groupRoles).length > 0 &&
    Object.keys(permitted).length === 0
  ) {
    throw new ForbiddenException(
      "Your role does not grant access to this resource",
    );
  }
}

request.resolvedIdentity = {
  userId,
  isSystemAdmin: user.is_system_admin,
  groupRoles: permitted,   // <- narrowed for non-admins only
  actorId: user.actor_id,
};
```

The `!user.is_system_admin` guard wraps the **whole** block, not just the hard deny. A
system admin who also holds `REVIEWER` in some group would otherwise have that group
stripped from `groupRoles` on general endpoints. Today that would be invisible — both
helpers and the `groupIdFrom` block at `identity.guard.ts:139` short-circuit on
`isSystemAdmin` before ever reading the map — but it contradicts the rule stated below
and would surface the moment anything reads `groupRoles` without checking the admin flag
first.

Worked example for Alice (`REVIEWER` in A, `MEMBER` in B):

```
handler declares "hitl.review"   → groupRoles = { A: REVIEWER, B: MEMBER }
handler declares nothing         → groupRoles = { B: MEMBER }          (A dropped)
```

And for a reviewer-only user:

```
handler declares "hitl.review"   → { A: REVIEWER }
handler declares nothing         → {} and memberships exist → 403
```

**This is why the change is small.** `getIdentityGroupIds` has 13 call sites and
`identityCanAccessGroup` has 105 (non-test, excluding the definitions) — and none of
them change. They already read `groupRoles`; narrowing it upstream makes all 118
correct at once:

- List endpoints call `getIdentityGroupIds`, which returns the keys of the narrowed map,
  so a reviewer's document list is filtered to nothing.
- By-ID endpoints call `identityCanAccessGroup`, which does not find the group in the
  narrowed map and throws `ForbiddenException`.

Both are existing code paths behaving correctly on narrowed input.

**System admins bypass entirely** — `isSystemAdmin === true` already short-circuits both
helpers, and the hard-deny check above excludes them. Do not narrow for system admins.

**Order matters:** narrowing must happen before the existing `requireSystemAdmin` and
`groupIdFrom`/`minimumRole` blocks at the end of `canActivate`, so those blocks see the
narrowed map. In practice the hard deny fires first for a reviewer-only user; for mixed
Alice the existing membership check then rejects the dropped group with its existing
message. Either way the outcome is 403 and no ordering surprise.

Because `REVIEWER` shares `MEMBER`'s tier (§3.3), the `MEMBER`-floor comparisons
scattered across the 105 `identityCanAccessGroup` call sites are **no-ops** for
reviewers. That is intended. Access is decided entirely by whether the group survived
narrowing — never by the role's rank.

### 4.3 API-key path — unchanged, but state the reasoning

`IdentityGuard` hardcodes `groupRoles = { [groupId]: GroupRole.MEMBER }` for API keys.
`MEMBER` grants `general.access`, so API-key behaviour is unchanged by this work.
API keys are issued by group admins and are not a user-facing persona; there is no
"reviewer API key" in scope. Leave the API-key branch alone.

### 4.4 Endpoints that must be annotated

This is the entire per-endpoint surface. Everything not listed here denies restricted
roles automatically, including endpoints added in future.

Remember these are **grants** (§3.2): none of them takes anything away from members or
admins, who reach all of it via `general.access`.

| File | Change | Why |
|---|---|---|
| `hitl/hitl.controller.ts` | `@RequireCapability("hitl.review")` at **class** level | Covers all 14 endpoints (`@Controller` at `:50`). Members and admins keep their existing access — this only *adds* reviewers. |
| `hitl/hitl.controller.ts` | `@RequireCapability("general.access")` on the `@Get("analytics")` handler (`:388`) | Method-level overrides class-level. Nothing in the frontend calls `/api/hitl/analytics` (verified by grep), so withholding it from reviewers costs no UX and keeps the grant minimal. |
| `hitl/hitl.controller.ts` | New `GET /api/hitl/sessions/:id/document` | Serves the document bytes the review canvas needs, scoped to the session. See §4.4.1. |
| `auth/auth.controller.ts` | `@RequireCapability("self")` on `GET me` (`:288`, `@Identity({ allowApiKey: false })` at `:301`) | Without it, a reviewer-only user is denied at login: `/me` declares no capability, so narrowing empties `groupRoles` and the hard deny fires. `refresh` (`:67`), `login` (`:121`), `logout` (`:168`), `callback` (`:213`) are already `@Public()` and never reach this code. |

`GET /me` needs `self` only to avoid the hard deny — its payload is unaffected by
narrowing, because `GroupService.getUserGroups` short-circuits on
`identity.userId === userId` and reads memberships straight from the database
(`group.service.ts:110-115`) rather than from `groupRoles`. So a reviewer still sees all
their groups in the group selector.

### 4.4.1 The review canvas needs document bytes — this is the one real gap

Per §1, `ReviewWorkspacePage.tsx:261` and `:268` load the page image with

```
GET /api/documents/:documentId/view       // document.controller.ts:550, iCAG at :584
GET /api/documents/:documentId/download   // document.controller.ts:683, iCAG at :716
```

Under narrowing both return 403 for a reviewer, and the frontend **fails silently** — the
`if (!response.ok) return` plus the bare `catch` leave `documentUrl` null, so the reviewer
gets a working queue, a working field panel, and a blank canvas with no error. This is
the failure mode most likely to reach production unnoticed, because every HITL endpoint
still answers 200.

Two ways out:

1. **Tag the document endpoints.** Method-level `@RequireCapability("hitl.review")` on
   `view`, `download`, and `thumbnail`. One line each, no frontend change. Cost: a
   reviewer can then read *any* document in their group by ID, not only ones in their
   queue — a wider grant than "reach the review queue and nothing else".
2. **Serve the bytes through HITL (chosen — D5).** Add
   `GET /api/hitl/sessions/:id/document` to `HitlController`, which resolves the session,
   applies the same `identityCanAccessGroup` check the other 14 handlers already use, and
   streams the file. Point `ReviewWorkspacePage` at it. The grant stays bounded to
   documents the reviewer actually has a session for.

Option 2 is chosen because option 1 quietly makes D2's "real boundary" not real for the
largest resource in the system. It costs one endpoint plus one frontend fetch swap.

Reuse the existing streaming path rather than duplicating it: the new handler should call
the same service method `DocumentController`'s `view`/`download` handlers call, after its
own session-scoped authorization. Keep the `view`-then-`download` fallback behaviour
(normalized PDF first, original second) so pre-normalization documents still render.

**Independently of which option is taken:** fix the silent swallow in
`ReviewWorkspacePage`. A failed document load should render an error state, not an empty
canvas. That swallow is what made this gap invisible in the first place.

The rest of the review surface is clean — `ReviewQueuePage`, `useReviewQueue`,
`useReviewSession`, `useAutoAdvance`, and the HITL components call nothing but `/hitl/*`.

### 4.5 Group member role assignment

`UpdateMemberRoleDto` (`group/dto/update-member-role.dto.ts`) validates with
`@IsEnum(GroupRole)`, so `REVIEWER` is accepted with **no code change** once the enum
value exists. Verify this rather than assuming; also confirm `GroupService`'s
add-member and approve-membership-request paths do not hardcode a `MEMBER | ADMIN`
union anywhere.

Only group admins and system admins can change member roles today —
`PATCH :groupId/members/:userId/role` (`group.controller.ts:505`, guarded by
`@Identity({ groupIdFrom: { param: "groupId" }, minimumRole: GroupRole.ADMIN })` at
`:504`). That is the right gate for assigning `REVIEWER`; no change needed.

### 4.6 Migration

```
apps/shared/prisma/migrations/20260729000000_add_reviewer_group_role/migration.sql
```

```sql
ALTER TYPE "GroupRole" ADD VALUE 'REVIEWER';
```

Then from `apps/backend-services`: `npm run db:generate` (the repo's wrapper — it writes
the generated client into both `apps/temporal/src` and `apps/backend-services/src`), then
the usual migrate step. **Do not run `npx prisma generate` directly.**

The latest migration on `develop` is `20260626000000_add_documents_list_indexes`, so the
`20260729000000_` prefix sorts correctly.

Note: PostgreSQL before 12 cannot run `ALTER TYPE … ADD VALUE` inside a transaction block
at all; 12 and later allow it as long as the new value is not *used* in the same
transaction. This migration only adds the value, so it is fine on 12+. If the deployment
target is older, split it so the `ALTER TYPE` is its own migration. No data backfill is
required — the new value is unused until someone assigns it.

---

## 5. Frontend changes

### 5.1 Surface the role

`AuthContext.tsx:20` currently types `role?: "ADMIN" | "MEMBER"`. Widen to include
`"REVIEWER"`. `MeResponseDto.groups[].role` is already typed `GroupRole` on the backend
and needs no change.

`GROUP_ROLE_OPTIONS` (`data/hooks/useGroups.ts:28`) is a hardcoded two-entry array
feeding the member-role dropdown; add `REVIEWER` there or the role cannot be assigned
from the UI. Note `GroupsPage.test.tsx` and `GroupDetailPage.test.tsx` both mock it.

Add a derived helper (`useAuth` lives in `AuthContext.tsx`, not its own file), driven by
the **active group** from `GroupContext:40` (per D3 the answer is group-dependent):

```ts
// apps/frontend/src/auth/useCapabilities.ts
export function useCapabilities() {
  const { isSystemAdmin } = useAuth();
  const { activeGroup } = useGroup();
  const role = activeGroup?.role;
  return { isRestricted: !isSystemAdmin && role === "REVIEWER" };
}
```

One flag is all the UI needs today: every role grants `hitl.review`, so a
`canReview` companion would be trivially `true` and is deliberately omitted. When the
Analyst role lands, this becomes a small switch on `role` and the nav filter reads the
capability list instead of a boolean.

Mirror the backend's map here rather than inventing a second vocabulary. Keep the two in
step by intent; there is no runtime coupling, and the backend is the authority — the
frontend copy exists to shape the UI, not to enforce.

### 5.2 Navigation

`RootLayout.tsx:64` — filter `navItems`, and hide the whole benchmarking section
(`:124`) when `isRestricted`. A reviewer sees exactly one nav entry, **HITL Review**,
plus the user menu.

Hide the **Settings** link too: `SettingsPage` is API-key management only, and those
endpoints already require `GroupRole.ADMIN` (`api-key.controller.ts:44,68`), so leaving
it visible would only show a reviewer a page of failing requests. **This is a separate
edit from the nav filter** — Settings is not an entry in `navItems`; it is hand-written
markup in two places, the expanded-sidebar `NavLink` at `:303` and the collapsed-sidebar
`Tooltip`/`ActionIcon` at `:325-342`. Both need the condition.

### 5.3 Routes

`App.tsx` — a reviewer typing `/workflows` must not get a broken page that fires
403-ing requests. Add a `RestrictedRoleGuard` alongside `NoGroupGuard`
(`apps/frontend/src/auth/NoGroupGuard.tsx` is the pattern to follow — same
`isLoading` → `null` shape) that redirects to `/review` when `isRestricted` and the
target route is outside the reviewer's allowlist (`/review` at `:84`,
`/review/:sessionId` at `:85`).

Note `ReviewWorkspacePage` is mounted **twice**: also at
`benchmarking/datasets/:id/versions/:versionId/review/:sessionId` (`App.tsx:103`). That
second mount is deliberately *outside* the allowlist — benchmarking is hidden from
reviewers entirely — so a reviewer redirects away from it. Confirm that is intended
rather than an oversight.

Also change the index route for restricted users: `{ index: true }` (`:55`) renders
`UploadPage`, which a reviewer cannot use. Redirect `/` to `/review` when `isRestricted`.

---

## 6. Tests

Follow the existing convention — spec files sit next to their source.

**`auth/capabilities.spec.ts`** (new)
- Every `GroupRole` value has an entry in `ROLE_CAPABILITIES` (guards against a future
  enum value being added without a mapping — this is the test that keeps default-deny honest).
- `REVIEWER` does not hold `general.access`.
- Every role holds `self`.
- **The wildcard**: `MEMBER` and `ADMIN` pass `roleHasCapability` for *every* value in the
  `Capability` union, iterated — including any added later. This is the test that stops a
  new feature capability from silently locking ordinary users out.
- **The wildcard does not leak**: `REVIEWER` passes `hitl.review` and fails
  `general.access`.
- `roleHasAnyCapability` returns true when one of several matches, false when none do.

**`auth/identity.guard.spec.ts`** (extend)
- Reviewer-only user, handler with no capability → 403.
- Reviewer-only user, handler with `@RequireCapability("hitl.review")` → passes, `groupRoles`
  contains the group.
- **Member** user, handler with `@RequireCapability("hitl.review")` → passes. The
  grant-not-restriction property from §3.2; without the wildcard this is where members
  would lose HITL.
- Mixed Alice, handler with no capability → passes, `groupRoles` contains **only** the
  MEMBER group.
- Mixed Alice, handler with `@RequireCapability("hitl.review")` → both groups present.
- Handler with two capabilities `@RequireCapability("hitl.review", "analytics.view")` →
  a role holding either one survives narrowing.
- System admin, handler with no capability → not narrowed, passes.
- System admin who is also `REVIEWER` in a group, handler with no capability →
  `groupRoles` still contains that group. This is the test for the `!is_system_admin`
  wrapper in §4.2; without it the group is silently stripped.
- User with zero memberships → unchanged behaviour (no hard deny; the existing
  `/request-membership` flow still applies).
- Method-level `@RequireCapability` overrides class-level.
- API-key request → unchanged.

**`hitl/hitl.controller.spec.ts`** (extend) — *the regression tests that matter most*
- A reviewer identity reaches the queue, opens a session, and submits corrections.
  This is the test that catches someone "tidying up" `ROLE_ORDER` by ranking `REVIEWER`
  below `MEMBER`: all 14 of this controller's `identityCanAccessGroup` calls would start
  throwing. Assert on at least one queue endpoint (line 68 path) and one
  session-mutation endpoint (line 226 path), since they reach the floor check by
  different routes.
- A reviewer identity fetches the document bytes for a session they hold
  (`GET /api/hitl/sessions/:id/document`, §4.4.1) → 200, and for a session in a group
  they are not in → 403. **Nothing in the original test list would have caught the
  §4.4.1 gap** — every HITL endpoint answered 200 while the canvas stayed blank. Do not
  ship without this one.

**Frontend regression for the same gap**
- `ReviewWorkspacePage` test: document fetch fails → an error state renders. Today the
  failure is swallowed and the canvas is silently empty.

**`auth/role-order.spec.ts`** (new, small)
- `ROLE_ORDER[REVIEWER] === ROLE_ORDER[MEMBER]`, with a comment pointing at §3.3.
  Cheap insurance against a well-meaning future edit.

**Integration / regression**
- One test per major module (documents, workflows, template-models, tables) asserting a
  reviewer gets 403 on a by-ID read and an empty list on a list endpoint. Pick the
  modules with the most `identityCanAccessGroup` call sites.

**Frontend**
- `RootLayout.test.tsx` — reviewer active group renders one nav item.
- `RestrictedRoleGuard` test mirroring `NoGroupGuard.test.tsx`.

Run backend tests from `apps/backend-services` and fix any that break. The widening is
mostly type-safe by construction: `ROLE_ORDER` is `Record<GroupRole, number>` and
`testFactory.ts` types roles as `Record<string, $Enums.GroupRole>`, so the compiler will
point at anything that needs a new branch. Expect the real breakage to be in tests that
assert on `groupRoles` contents, since the guard now narrows it.

---

## 7. Documentation to update

Per `CLAUDE.md`, docs live in the matching `docs-md/` topic folder; the `docs-sync`
skill has the workflow.

- `docs-md/auth/GROUP_RESOURCE_AUTHORIZATION.md` — new section on capabilities and the
  narrowing rule; the "Enforcement Location" section currently describes two mechanisms
  and needs a third.
- `docs-md/auth/AUTHENTICATION.md` — the role list.
- `docs-md/groups/ASSIGN_USERS_TO_GROUPS.md` and `GROUP_DETAIL_PAGE.md` — the new role
  in the member dropdown and what it means.
- `apps/backend-services/src/auth/README.md` — module-level description.

Swagger: the two annotated controllers gain a `@ApiForbiddenResponse` describing the
capability denial, per the project's controller documentation rule. The new
`GET /api/hitl/sessions/:id/document` endpoint (§4.4.1) needs the full treatment —
dedicated response DTO referenced via `type`, plus `@ApiOkResponse`,
`@ApiForbiddenResponse`, `@ApiUnauthorizedResponse`, and `@ApiNotFoundResponse`.

---

## 8. Adding the Analyst role later

The point of the design. When the analytics dashboard exists:

1. `ANALYST` on the `GroupRole` enum + migration.
2. `"analytics.view"` added to the `Capability` union, and
   `[GroupRole.ANALYST]: ["analytics.view", "self"]` in `ROLE_CAPABILITIES`.
   **`ADMIN` and `MEMBER` are not touched** — the `general.access` wildcard (§3.2) grants
   them the new capability automatically, and the wildcard test in §6 proves it.
3. `ROLE_ORDER[ANALYST] = 0` — same tier as `MEMBER` and `REVIEWER`, for the reason in
   §3.3. The ladder stays silent about restricted roles.
4. `@RequireCapability("analytics.view")` at class level on the analytics controller.
   If reviewers should reach it too, that becomes
   `@RequireCapability("analytics.view", "hitl.review")` — any-of, per §4.1.
5. Frontend: one more branch in `useCapabilities` and the nav filter.

No guard change, no helper change, no touching the other 118 call sites, and no edit to
an existing role's capability list.

The one thing to check per role, which §4.4.1 is the cautionary tale for: **does the new
role's UI read anything outside its own controller?** Grep the feature's pages for
`fetch("/api/` and `apiService.` before declaring the endpoint surface closed.

---

## 9. Out of scope

- Capabilities stored as data, or assignable independently of a role.
- Reviewer-scoped API keys.
- Any change to `is_system_admin`.
- Finer-grained HITL permissions (e.g. review-but-not-escalate).
- The analytics dashboard itself.

---

## 10. Summary of files touched

**New**
- `apps/backend-services/src/auth/capabilities.ts`
- `apps/backend-services/src/auth/capabilities.spec.ts`
- `apps/backend-services/src/auth/capability.decorator.ts`
- `apps/backend-services/src/auth/role-order.spec.ts`
- `apps/shared/prisma/migrations/20260729000000_add_reviewer_group_role/migration.sql`
- `apps/frontend/src/auth/useCapabilities.ts`
- `apps/frontend/src/auth/RestrictedRoleGuard.tsx` (+ test)

**Modified**
- `apps/shared/prisma/schema.prisma` — one enum value
- `apps/backend-services/src/auth/role-order.ts` — three entries
- `apps/backend-services/src/auth/identity.guard.ts` — one block (§4.2)
- `apps/backend-services/src/auth/identity.guard.spec.ts`
- `apps/backend-services/src/hitl/hitl.controller.ts` — class-level decorator, a
  method-level override on `analytics` (`:388`), and the new session-document endpoint (§4.4.1)
- `apps/backend-services/src/hitl/hitl.controller.spec.ts`
- `apps/backend-services/src/auth/auth.controller.ts` — one decorator on `GET me` (`:288`)
- `apps/frontend/src/auth/AuthContext.tsx:20` — role union
- `apps/frontend/src/data/hooks/useGroups.ts:28` — `GROUP_ROLE_OPTIONS`
- `apps/frontend/src/layouts/RootLayout.tsx` — nav filtering (`:64`, `:124`) **and** the
  two Settings links (`:303`, `:325-342`)
- `apps/frontend/src/App.tsx` — guard + index redirect (`:55`, `:84-85`)
- `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` — point the
  document fetch at the HITL endpoint (`:261`, `:268`) and stop swallowing the failure
- docs per §7

**Explicitly not modified:** the 13 `getIdentityGroupIds` call sites, the 105
`identityCanAccessGroup` call sites, and the other ~30 controllers — including
`DocumentController`, deliberately (D5 / §4.4.1).
