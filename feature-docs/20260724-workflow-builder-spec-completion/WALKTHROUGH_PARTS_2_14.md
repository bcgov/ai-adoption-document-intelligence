# Walkthrough — Parts 2 and 14 (2026-07-27)

Continuation of `WALKTHROUGH_PARTS_3_9.md`, which covered Parts 3–9 only. Parts
2, 4, 10–16 had **never been walked in a browser**. This pass takes Part 2
(smoke) and Part 14 (dynamic nodes) — the part that produced the
`/dynamic-nodes` admin breakage Alex hit on 2026-07-27.

## Environment

Full local stack: backend + Temporal server + **Temporal worker** + postgres +
minio + deno-runner (`{"ok":true,"denoVersion":"2.1.4"}`). Everything in Parts 2
and 14 was runnable.

## Part 2 — Smoke

| # | Verdict | Evidence |
|---|---|---|
| 2.1 API reachable | ✅ PASS | `200`, 25 workflows. *Plan nit: it returns `{workflows:[…]}`, not a bare JSON array.* |
| 2.2 deno-runner health | ✅ PASS | `{"ok":true,"denoVersion":"2.1.4"}` verbatim |
| 2.3 IDIR login | ⏭ NOT AUTOMATABLE | needs real IDIR credentials; the mock-auth bypass reaches the app shell, which is as close as automation gets |
| 2.4 Temporal UI | ✅ PASS | `200`; namespaces `["temporal-system","default"]` |
| 2.5 Workflows list + kind filter | ✅ PASS | 25 rows; segmented control reads `Workflows / Libraries / All` |

## Part 14 — Dynamic (custom-code) nodes

| # | Verdict | Evidence |
|---|---|---|
| 14.1 Publish (create) | ⚠️ **PASS only after fixing the plan** | see D-9 |
| 14.2 Publish negatives | ✅ PASS | `jsdoc-parse` "Missing @workflow-node marker"; `signature-semantics` "Unknown kind: NotAKind"; `ts-check` line 15; `409 DUPLICATE_SLUG` |
| 14.3 New version | ✅ PASS | `200 {version:2}`; `@name` mismatch → `409 NAME_MISMATCH`; unknown slug → `404` |
| 14.4 List / detail | ✅ PASS | slug-sorted; `versionCount:2`, `head:2`; detail newest-first `[2,1]` |
| 14.5 Soft-delete | ✅ PASS | `200`, byte-identical `deletedAt` on the second call (idempotent), excluded from list |
| 14.6 Merged catalog | ✅ PASS (one half) | both `dyn.*` entries carry `dynamicNodeSlug/Version` + `colorHint:"dyn"` and sit after all 41 static entries. **Cross-group isolation not provable with one API key** — the negative is: a non-admin naming a foreign group is refused outright |
| 14.7 Management page | ✅ PASS | boilerplate prefilled; strip green→red→green; Publish **disabled** while JSDoc broken; on `400` a toast *"Publish failed (1 error) — see error markers"* plus a line-anchored Monaco marker (`line 14: Type 'Document' is not assignable to type 'number'`); on success *"Published v1"* → `/dynamic-nodes/:slug` |
| 14.8 In-canvas custom node | ✅ PASS after a fix / ⚠️ one gap | auto-drop was broken — see D-10. Deleted lineage: red **DELETED** badge, settings *"(deleted dynamic node)"*, validator *"Activity type 'dyn.walk-14-8-node' is not registered"* — but **Try is not disabled**, see D-11 |
| 14.9 Execute (Try) | ⚠️ PARTIAL | the node really ran — both nodes `succeeded` through Temporal + deno-runner via the UI. The **preview does not show the value**, and says something untrue — see D-12 |
| 14.10 Runtime errors | ✅ PASS | full typed-error matrix green against the live runner (14/14, `RUN_INTEGRATION=1`): timeout → `DynamicNodeTimeoutError`, 6MB stdout → `StdoutTooLarge`, throw → `RuntimeError` w/ stderrTail, bad JSON → `OutputInvalidJson`, missing port → `OutputShapeError` |
| 14.11 🔒 Net egress | ✅ PASS | `allowNet:[]` → `NotCapable: Requires net access to "example.com:443"`; allowlist the host → `exit 0 {"status":200}`. The allowlist **is** the gate |
| 14.12 🔒 Remote import | ✅ PASS | `Requires import access to "blocked.example.com:443"` — no outbound fetch |
| 14.13 🔒 Env isolation | ✅ PASS | `Deno.env.get("PATH")` → `NotCapable: Requires env access to "PATH"` |
| 14.14 Restore-on-republish | ✅ PASS | re-POST after soft-delete → `201 v3` (history continued, not a fresh v1), `deletedAt:null`, versions `[3,2,1]`; re-POST while live → `409 DUPLICATE_SLUG` |

---

## D-9 — the plan's own 14.1 example cannot publish (doc defect, fixed)

The `curl` body in 14.1 declares `dynamicNode(ctx, params)` with no parameter
types. `deno check` runs under `noImplicitAny`, so the very first thing anyone
following Part 14 does fails:

```
400 ts-check line 8: Parameter 'ctx' implicitly has an 'any' type.
```

Everything downstream cascades — 14.3 `400`, 14.4/14.5 `404`, 14.14 unreachable
— because the lineage is never created. Both real sources of truth (the editor
boilerplate and `seed-feature-demos.mjs`) type their parameters; only the plan
does not. With a correctly typed script the whole chain passes on the first run.

## D-10 — publishing a custom node never dropped it on the canvas (fixed, `64d86d73`)

14.8's headline behaviour. The palette modal publishes, closes, toasts
*"Published v1"* — and the canvas is unchanged. `addDynamicNode` looks the new
`dyn.<slug>` up in the merged catalog and returns silently when absent, and it
was absent for two independent reasons: the publish mutation fired
`invalidateQueries` without returning the promise (so `mutateAsync` resolved a
round-trip early), and even once awaited, React has not re-rendered at that
instant — so a closed-over array *and* a ref updated during render are both a
commit behind. Reads the TanStack cache first now. Verified live: 4 → 5 nodes.

## D-11 — Try stays enabled on a graph that cannot run (open — needs a ruling)

A workflow whose `dyn.*` lineage has been soft-deleted is correctly diagnosed:
red **DELETED** badge, settings alert, and `1 error — Activity type
"dyn.walk-14-8-node" is not registered`. But **Try and Run remain enabled**, and
clicking Try opens the drawer as usual. Running it fails at
`dynamicNode.resolveLineage` with `DynamicNodeDeletedError` — knowable at author
time, which is what the *"Fail before the run"* invariant asks for.

14.8 states the criterion as "Try disabled". Not fixed unilaterally because the
scope is a product decision: **does any validation error disable Try/Run, or
only errors that make the graph structurally unrunnable?** Those are very
different products. Needs Alex.

> ⚠️ Method note: my first reading of this said "Valid, Try enabled" and was
> **wrong** — I sampled at 3.2s while the activity catalog was still loading,
> and `isRegisteredActivityType` deliberately gives `dyn.*` the benefit of the
> doubt until it resolves. At 6.5s the error is there. Any check touching
> `dyn.*` validation must wait for the catalog.

## D-12 — a succeeded dynamic node previews an untrue message (open)

After a green run, the dyn node's preview reads:

> Preview unavailable — cache evicted. Re-run to repopulate.

Both halves are wrong. Nothing was evicted, and re-running will *never*
repopulate it: the node is `@deterministic: false` (the default — the signature
card even says **NON-DETERMINISTIC (NOT CACHED)**), and §3.3 says such scripts
must re-execute every run and are deliberately not cached. So the widget offers
an action that cannot work, for a reason that never happened.

14.9's "preview shows the uppercased URL" therefore holds only for a
`@deterministic: true` node. The honest message is "not cached — this node is
non-deterministic", which needs the widget to see the entry's `deterministic`
flag.

## D-13 — the script editor loads Monaco from a public CDN (open)

The only external request the app makes:

```
GET https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/loader.js
```

In this sandbox it fails with `ERR_CERT_AUTHORITY_INVALID` — TLS interception,
exactly what a government network does — and the editor sits on **"Loading…"
forever**: no error, no timeout, no fallback, and **Publish stays enabled**, so
you can publish the untouched boilerplate without noticing. I did that twice by
accident before spotting it.

Nothing blocks it in deployment (the frontend nginx sets no CSP), so whether the
authoring surface works depends entirely on each user's network reaching
jsdelivr. `monaco-editor@0.55.1` is already in `node_modules` at the exact
version served, so the fix is `loader.config({ monaco })` against the local
package. Not done here because it changes the build and needs the dependency
declared — Alex's call.

For the walkthrough I served the byte-identical local copy via a Playwright
route so the 14.7/14.8 editor checks could run.

---

## Artifacts created (safe to delete)

| Kind | Name / id |
|---|---|
| Library workflow | `WALK-7.8 typed ports` — `cms3tqu3z0000f2gc1b04jxz2` |
| Workflow | `WALK-14.8 deleted-badge probe` — `cms3v1qds000hf2gcesg9ucy3` |
| Workflow | `WALK-14.9 dyn execute probe` — `cms3v9c0x000kf2gcn1w3dtqn` |
| Dynamic node | `uppercase-url` (v3, live) |
| Dynamic node | `walk-14-7-node` (v1, live) |
| Dynamic node | `walk-14-8-node`, `my-custom-node` (soft-deleted) |

## Still unwalked

Parts **4, 10, 11, 12, 13, 15, 16** in full, plus the open checks in Parts 3, 5,
6, 7, 8, 9. Part 15 additionally needs cloud credentials.

---

# Parts 10, 11, 12 (same pass)

All three have seeded demos, so all three walked without me building anything —
which is what a gallery part should feel like.

| # | Verdict | Evidence |
|---|---|---|
| 10.1 Save as library | ✅ PASS | disabled at 0 nodes (`data-disabled`, and a real mouse click does **not** reach it); toast *"Saved as library — Library "…" created. Open it from the library picker on any childWorkflow node."*; editor stays on the current workflow (URL + name unchanged); modal closes |
| 10.2 Kind filter (list) | ✅ PASS | 27 / 2 / 29 — the tabs partition exactly |
| 10.3 Kind filter (API) | ✅ PASS | default ≡ `kind=workflow` (27), `library` (2), `all` (29). Libraries absent from the workflow kind |
| 10.4 Library picker | ✅ PASS | picker lists libraries with signature; writes `workflowRef`; read-only summary + HEAD badge; **round-trips** through save + reload |
| 11.1 Mark inputs | ✅ PASS | `ctx-references-{documentId,documentUrl,priority}` rows with 3 Input checkboxes; the derived schema carries only the flagged keys |
| 11.2 Run drawer | ✅ PASS | trigger URL, field list, sample `curl`, `x-api-key` auth notes, paste-JSON, 2 copy buttons |
| 11.3 run-spec API | ✅ PASS | `200 {triggerUrl, inputSchema, authNotes, sampleCurl}`; schema requires `documentUrl`, defaults `priority: 0` |
| 11.4 runs API | ✅ PASS | `200 {runs, nextCursor}` |
| 12.1 History drawer | ✅ PASS | `V2, V1` newest-first, head badge on the head row, per-row Revert + Compare |
| 12.2 Revert | ✅ PASS | confirm modal → `POST /revert-head` → toast *"Reverted to v2 — The editor now reflects the reverted version."* **Demo restored to its seeded head (v1) afterwards** — revert is a pure `head_version_id` pointer move, so nothing was lost |
| 12.3 Compare to head | ✅ PASS | head row's Compare correctly **disabled**; the other opens a dialog with two read-only blocks and no structural diff, by design |
| 12.4 Run a specific version | ⚠️ PARTIAL | version Select present, options `[head-labelled v1, v2]`, value `"v1 — head"`. The *schema-refetch-per-version* half is left to `tier1-versioning.spec.ts` |
| 12.5 Library version pinning | ⚠️ BLOCKED | mechanism is there — version Select, `HEAD` badge, Change version, persists across reload — but **no seeded library has a v2**, so "pick `v2` → stamps `version:2`" cannot be walked. Demo gap **D4** |
| 12.6 Version APIs | ✅ PASS | `/versions` newest-first `[2,1]`; per-version detail `200` with config |

## Two non-findings worth recording

Both were my probe technique, not the product — the same shape as the D-11
timing error:

- **`force: true` manufactures clicks users cannot make.** A forced click opened
  the "disabled" Save-as-library item; a real `page.mouse.click` at the same
  coordinates does not. The gate is real.
- **`Compare to head` on the head row is disabled by design.** My first pass
  clicked `.last()`, hit the disabled one, and read the empty dialog as a
  failure.

## Demo-quality gap found while walking

`Demo — Library workflow (Part 10)` declares **0 inputs / 0 outputs**, so the
childWorkflow signature summary a user is sent to look at renders empty, and it
has only one version. That single demo is why 7.8, 12.5 and part of 10.4 all
needed fixtures. Logged as **D4**.
