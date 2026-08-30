# Document Intelligence Platform — roadmap to handover

**Draft for Alex, 2026-08-07.** Covers 2026-08-11 → 2026-12-31 (20 weekly sprints,
Sprint 32 → Sprint 51 on board 721; Sprint 31 ends 2026-08-11).

Handover target is end of calendar year. The receiving developers are **Andrew Barnes**
and **Sandeep Tandon** — already agreed as the new admins on OpenShift, Azure, GitHub
and SSO (`!Justin/2026-07-21 team demo.txt`).

**The bar this roadmap is written against** is Alex's own, from that same note:

> A handover is considered complete when a competent new team can set up, run, deploy,
> and extend the project without contacting the original developers.

---

## 1. The four asks, and one I added

| # | Workstream | Alex's words |
|---|---|---|
| **A** | Finish the workflow designer | *"a new workflow designer (the branch i had running for a long time now)"* |
| **B** | Restructure node types | *"restructure what kind of nodes i have in my system (so make it more userfriendly)"* |
| **C** | Add more nodes | *"introduce more nodes to make system more useful"* |
| **D** | Sample workflows | *"put together some sample workflows that demonstrate the various capabilities"* |
| **E** | **Handover readiness** | **Not asked for — added.** See below. |

**Steer of 2026-08-07, folded into C and D:** the SDPR pipeline is already built, so it
cannot be the forcing function for new nodes. Instead —

> *"build a few pipelines that fit with bcgov ecosystem, so embed with that where possible."*

C is therefore **BC Gov ecosystem connectors**, and D is **pipelines that plug into BC
Gov services**, rather than the generic invoice/mortgage/contract set from the capability
plan's Part 6. That set was chosen by cross-vendor revealed preference — US commercial
IDP galleries — which is the wrong demand signal for a platform whose next users are
other BC ministries.

**Why I added E.** The handover is stated as a date, but the bar quoted above is a
*work item*, and nothing is currently tracked against it. Concretely: the AI agent in
the builder defaults to Azure GPT-5.4, which **nobody but Alex can call** — so a second
person cannot run that feature at all today. A fresh setup still returns 500 on every
login. Jira epic **AI-1963 "SDPR project handover"** exists, has no description, no
assignee and no children. If A–D all land and E doesn't, the handover fails on its own
definition. **Cut it if you disagree — but say so explicitly rather than by omission.**

---

## 2. Assumptions I made

I asked four questions and you dismissed them, so I drafted on my recommended answers.
Each is one sentence to reverse.

| # | Assumption | Reverse it by saying |
|---|---|---|
| 1 | **"Designer complete" = ship it, backlog the rest.** Land PR #230, fix the 28 open batch-four items, wire the existing Playwright suite into CI, walk the 29 unchecked manual tests. The 57 gap-register entries awaiting your ruling become a *written backlog* handed over, not work you do. | *"No — I want the gap register closed out too"* (adds ~4–6 weeks), or *"merge and stop"* (frees ~4 weeks, ships known UX defects) |
| 2 | **Restructure depth = rename, regroup, and merge the plumbing.** Plain-language labels, stop printing internal ids, rebuild the categories, and collapse the three-node Azure OCR sequence into one node with the granular steps demoted. Needs a migration for saved workflows. | *"Naming and grouping only"* (frees ~2 weeks, no migration), or *"also unify the registries and finish port typing"* (adds ~3 weeks) |
| 3 | **~~New nodes = Wave 1 spine, then let the SDPR pipeline drive it.~~ Superseded 2026-08-07. New nodes = BC Gov ecosystem connectors.** The SDPR pipeline is built, so it drives nothing. `http.request` survives from Wave 1 because it is the transport every connector needs; the other three Wave-1 primitives drop down the list. The connectors and the pipelines that need them are in C and D below. | *"add / drop this connector: …"* |
| 4 | **Jira shape = four new epics, one per workstream, plus AI-1963 for handover.** Old overlapping stories fold in; AI-1281 closes as superseded. Full tree in §6. | *"Keep AI-1281 as the single epic"*, or *"put an Initiative on top"* |

---

## 3. Where things actually stand (measured today, not assumed)

### A — the designer

Genuinely nearly done as *feature work*, and genuinely not shipped.

- **223 of 224 user stories complete** across 13 phase folders. The one open story is
  US-053 (a border-colour warning) and it is blocked on console text from you, not on
  engineering.
- **Phase 5 was never started.** It is the document-segmentation node pack
  (`document.split.subdocument`, `document.split.layout`, `text.chunk.semantic`,
  `segment.crop`) at `docs-md/workflows/IMPLEMENTATION_PLAN.md:310`. It has no
  requirements and no stories. **Treated here as workstream C material, not as
  unfinished designer work** — the dependency graph shows Phase 7 never needed it,
  which is why the branch shipped without it.
- **PR #230 is the problem.** Open, no longer draft, `REVIEW_REQUIRED`, last touched
  2026-08-04. **563 commits ahead of `origin/develop` and 27 behind. 1,194 files,
  +231,128 lines.** Its own status board says it is *"not reviewable by a human in any
  meaningful sense, and every day on this branch makes it worse."*
- **Fix batches one, two and three are closed** (12 + 17 + 7 items, all traced to
  commits). **Batch four is open: 5 of 33 done**, all five being icon fixes in commit
  `f3263a0f`, which **is not pushed** — so the PR doesn't even contain them.
- **No Playwright job exists in `.github/workflows/`.** 76 e2e specs are written and
  nothing runs them; roughly 11 were failing when last checked.
- Manual test plan: **138 of 167 checks walked**, 29 not.
- Gap register: **106 entries, 47 ruled or shipped, 57 waiting on you** (18 are
  "do nothing" proposals needing only a yes; 39 need verification first).

### B — node types

**Nothing is written down for this.** I searched all 216 refs, all three stashes and
the untracked tree. The closest prior art is
`docs-md/workflows/WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md`, which proposes composite nodes
and a demote list, and `ACTIVITY_PARAMETERS_AUDIT.md`, which says which parameters to
expose or hide. **The design has to be written before this can be ticketed properly.**

What a user sees today:

- **37 palette nodes** — 29 visible activities + 2 sources + 6 control-flow — in
  **12 categories**, spread across **3 separate registries** (`ACTIVITY_CATALOG`,
  `SOURCE_CATALOG`, and a hard-coded frontend list for control flow).
- **Every palette row prints its raw internal id** in monospace under the friendly
  label (`ActivityPalette.tsx:375`). The user reads `azureOcr.submit`, `pollUntil`,
  `childWorkflow` on screen regardless of what the display name says. This directly
  contradicts the project's own rule in `WORKFLOW_DESIGN_BRIEF.md` §12: *"Don't expose
  Temporal- or engine-internal terminology on the canvas."*
- **Azure OCR is three nodes for one user task** — Submit OCR → Wait for OCR Result →
  Extract OCR Result. Azure classification is two more. That is the single biggest
  "why is this so complicated" moment for a new user.
- Labels that are engineer-speak: *"Poll Classify"*, *"Submit Classify"*, *"Read Blob"*
  (Azure storage vocabulary), *"Extract Page to Blob"* (the label says blob, the id says
  base64), *"Generic Data Transform"*, *"Combine Segment Result"*.
- **`Flow Control` is a dead category** — no activity declares it and the palette
  explicitly skips past it.
- **79 of ~145 ports (~55%) are still the untyped `Artifact` wildcard**, which is why
  auto-wire guesses wrong. Two mirror copies of the kind vocabulary are stale at
  11 kinds against the registry's 32, so custom-node authors cannot even name most of
  the taxonomy.

### C — new nodes: what the platform can and cannot reach today

I mapped every external system the platform talks to. The BC Gov picture is thinner
than it looks from the deployment config.

**Real BC Gov integrations that exist:**

| Service | State |
|---|---|
| **IDIR via Keycloak** (`loginproxy.gov.bc.ca`) | Real and complete — confidential OAuth2 + PKCE, HttpOnly cookies, CSRF double-submit |
| **APIM** (`api.gov.bc.ca`) | Real — Azure Document Intelligence and Azure OpenAI traffic is already proxied through it, with code workarounds for APIM's quirks |
| **CHES** (Common Hosted Email Service) | **Code exists and works — but no workflow can reach it.** `apps/ches-adapter/` is a full OAuth2 client-credentials integration against `ches.api.gov.bc.ca`, and its only trigger is a Prometheus Alertmanager webhook. Lifting it into a Temporal activity is the cheapest real BC Gov connector on the board. |
| **OpenShift Silver** | Deployment, not integration |

**Zero hits anywhere in the repo:** CHEFs, `form.gov.bc.ca`, CDOGS, COMS, BC Address
Geocoder, BCeID, ORCS, ARCS, DataBC. **There is no CHEFs integration and no mention of
one** — despite the 2025-10-31 prototyping notes proposing a CHEFs–OCR bridge as the
*first* integration to build.

**Three gaps that matter for anything BC Gov:**

1. **No generic outbound call.** No `http.request`, no webhook, no callback. 49
   registered activity types and not one of them reaches an arbitrary endpoint.
2. **Results come back by polling only.** The published integration guide
   (`docs/_pages/integrations.html`) literally instructs consumers to write a
   `while true; … sleep 5; done` loop. There is no completion callback. For a service
   other ministries are meant to consume, that is the integration story.
3. **ICM handoff is simulated.** The SDPR workflow ends in a node labelled *"Build
   Simulated ICM Handoff Payload"* — it assembles the JSON and sends it nowhere.
   `data.transform` already renders JSON → XML with a SOAP envelope, built deliberately
   format-agnostic for this. **Only the transport is missing.**

**The escape hatch that already works:** dynamic nodes. A user can author TypeScript in
the browser with `@allowNet ["host"]`, and it runs sandboxed in the Deno runner with
network access to that host only. A geocoder lookup could be prototyped today with no
deploy. What dynamic nodes *cannot* do is hold a secret — env access is restricted to
four injected names — so any connector with its own API key must be a first-class node.

The 12-wave capability plan still exists, on branch
`feature/workflow-builder-new-capabilities` (one commit, 2026-06-23, never merged). It
stays as handover paper. **Its Part 6 pipeline list is not what C and D build** — see
below.

### D — sample workflows

What exists today: 4 documented templates, 14 seeded feature demos, and a 16-stop
guided tour in `docs-md/workflows/GALLERY.md`. Those demonstrate *builder features* —
typed I/O, auto-wire, grouping, versioning. **None of them demonstrates a business
outcome**, which is what a sample workflow is for.

`COMPREHENSIVE_PLAN.md` Part 6 offers ten canonical pipelines — invoice, receipt, bank
statement, passport, mortgage packet, W-2, bill of lading, contract, health claim. They
were selected by **cross-vendor revealed preference across US commercial IDP galleries**
(Azure, Google, AWS, UiPath, Rossum, Nanonets, Mindee, Veryfi). That is a good demand
signal for a product competing with those vendors and the wrong one for a platform whose
next users are ENV, NRS, AG and LBR. **Superseded by your 2026-08-07 steer.**

Two of the ten survive on BC Gov grounds rather than vendor grounds: invoice, because
**AI-1225 "CITZ Partnership — Invoice Automation"** is a live partnership, and SDPR,
because it is built.

Standing constraint from `DEMO_FABRICATION_AUDIT_20260718.md`, your own bar:

> demos must be sensible to a first-time user and be something a user could plausibly
> build themselves — not just "passes validation".

---

## 4. The plan

The order is yours — A → B → C → D — and it is the right order, because building
sample workflows against a node taxonomy you're about to restructure means building
them twice. The overlaps below are where a workstream can start its *design* while the
previous one is still in *build*.

```
Aug          Sep          Oct          Nov          Dec
|------------|------------|------------|------------|
A: designer  ============================
B: node restructure    [design]==========
C: bcgov connectors      [confirm]=============
D: bcgov pipelines                  ==================
E: handover readiness ==================================||  hard stop Dec 12
```

C starts with conversations, not code, because two of its connectors depend on people
outside this team saying yes. Those conversations run in September so the answers arrive
while there is still time to act on them.

### A — Finish the workflow designer · Aug 11 → Sep 26 (7 weeks)

| Step | What | When |
|---|---|---|
| A.1 | **Decide PR #230: land as one, or split.** Merge `origin/develop` in first (27 behind). Recommendation: **land as one.** `STACKED_PR_SPLIT_PLAN.md` was written when the branch was a third its current size and still names a rebase prerequisite; splitting 563 commits now costs more than the review quality it buys, and the real safety net is the test suites — which is why A.2 comes first. | **Aug 11–29** |
| A.2 | **Wire the 76 existing Playwright specs into CI, triage the ~11 failures.** Highest-leverage item on the board: it is the only thing that makes A.1 safe, and every coverage item downstream is blocked behind it. | Aug 11–22 |
| A.3 | **Batch four — 28 remaining items.** ~20 contained frontend fixes (ports as `+`, error-path affordances, Try-vs-Run distinction, run-history dismissal, top-bar and switcher rework, workflows-table overflow, group right-click). Item 20 (colour vocabulary) **needs your ruling before any code**. Item 23 is handed to E.1. Items 31–33 are docs and process. | Aug 11 – Sep 19 |
| A.4 | **Walk the 29 unchecked manual-test checks + the 3 remaining Layer-0 checks** (7.8 library port kinds, 9.9b/9.9c replay safety). Seed demos D5 and D6, which block checks 13.2/13.6/13.7. | Sep 8–26 |
| A.5 | **Soft-delete + the docs update, then close AI-1174.** Soft delete follows dbarkowsky's 2026-04-29 design: deletion of classifiers and prompts, plus a cron reconciling against Azure. | Sep 15–26 |
| A.6 | **The 57 gap-register entries become a written backlog**, not worked. Delivered as a handover artifact in E.6. | Sep 26 |

**Done when:** #230 is merged, CI runs e2e on every PR, batch four is closed, the
manual test plan is fully walked, AI-1174 is closed.

### B — Restructure node types · Sep 15 → Oct 31 (6 weeks)

| Step | What | When |
|---|---|---|
| B.0 | **Write the design.** There isn't one. Needs: the target category set and what each category means to a user; the naming rules; the composite-node list; the migration story for saved workflows; what stays visible vs demoted to advanced. **With the reviewer** — he has done two walkthroughs and this is his domain. Start from `WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md` and `ACTIVITY_PARAMETERS_AUDIT.md`. | **Sep 15–26** |
| B.1 | **Names and descriptions.** Every label reads as a task a user performs. Kill "Poll", "Submit", "Blob", "Generic", "Flatten". Stop printing internal ids in the palette, the type-swap modal and the hover-extend popover. Purge activity ids from user-visible help text. | Sep 29 – Oct 10 |
| B.2 | **Rebuild the categories.** Retire the dead `Flow Control` entry, collapse the four OCR categories into something a user recognises, decide where sources and control flow sit relative to the rest. Single source of truth for category order (currently hand-duplicated in two files). | Oct 6–17 |
| B.3 | **Composite nodes + migration.** One "Extract text (Azure)" replacing submit → poll → extract; one "Classify document (Azure)" replacing submit → poll. Granular steps demoted to advanced, not deleted. Migration for saved workflows and a version bump. | Oct 13–31 |
| B.4 | **Rewrite `WORKFLOW_NODE_CATALOG.md`** — stale since 2026-07-25; it predates sources, dynamic nodes and the Identifier kinds, and uses naming the palette abandoned. Refresh the affected gallery stops. | Oct 27–31 |

**Done when:** a first-time user can open the palette and name what every node does
without asking anyone.

### C — BC Gov ecosystem connectors · Sep 22 → Nov 21 (8 weeks)

Nodes that let the platform plug into services other ministries already use, so a new
partner's first question — *"how does it talk to what we've got?"* — has an answer that
isn't "write a polling loop".

Overlaps B deliberately. B is frontend, catalog and palette work; C is Temporal
activities and backend. Different people, no collision.

| Step | What | When |
|---|---|---|
| C.0 | **Confirm the integration targets before building for them.** Three conversations, none of them code, all with lead time: (1) the **CHEFs** team — is there an API, and appetite for a document-intelligence bridge; (2) **ICM** — Loren ruled integration out of Phase 1 on 2026-08-04, so making the handoff real means revisiting that ruling, not quietly reversing it; (3) **APIM** — what BC Gov actually exposes, which is the same question E.1 is already asking. | **Sep 22 – Oct 3** |
| C.1 | **`http.request`** — a generic outbound call. The system has none today, and it is the transport every other connector needs. Closes **AI-1138**. | Oct 6–17 |
| C.2 | **Run-completion callback / outbound webhook.** Today the published integration guide tells consumers to poll in a `sleep 5` loop. This replaces that with a callback on completion. The highest-value item in C for anyone consuming the platform. | Oct 13–24 |
| C.3 | **CHES send node** — Common Hosted Email Service. Mostly lifting `apps/ches-adapter/src/ches.ts` into a Temporal activity; the OAuth2 client-credentials flow and token caching already work in production, they just aren't reachable from a workflow. | Oct 20–31 |
| C.4 | **CHEFs connector** — a `source.chefs` webhook source (the first user of the `runtime: "push"` pattern already reserved in `source-types.ts`), plus submission fetch and field write-back. **Gated on C.0.** It needs its own credential, so it must be a first-class node rather than a dynamic one. | Oct 27 – Nov 14 |
| C.5 | **BC Address Geocoder lookup** — validate and normalise extracted addresses against the authoritative provincial source. Public API, no secret, so it can ship as a dynamic node first and be promoted if it earns it. Cheapest genuinely useful enrichment on the list. | Nov 10–21 |

**Carried from the old Wave-1 list, built only if C leaves room:** a generic
rule/validation node (`document.validateFields` is document-branded), a per-field
confidence gate (`ocr.checkConfidence` is welded to OCR), and a standalone
`llm.structured` (the LLM is welded inside `ocr.enrich` behind a flag). All three were
justified by the SDPR pipeline, which is built — so they lost their forcing function and
drop below the connectors.

**Explicitly not in scope:** Waves 2–12 of the capability plan. Handed over as paper (E.6).

### D — BC Gov sample workflows · Nov 3 → Dec 19 (7 weeks)

Each one ships three times over: a starter template in the library, a stop in the
gallery, and a regression fixture in the benchmark suite.

| Step | Pipeline | Why this one | When |
|---|---|---|---|
| D.1 | **SDPR monthly report → real ICM handoff.** Promote the workflow that already exists, and replace its *"Build Simulated ICM Handoff Payload"* node — which assembles the JSON and sends it nowhere — with a real transport via C.1. `data.transform` already renders the SOAP envelope. | Nov 3–7 |
| D.2 | **Ministry intake starter** — upload → classify → extract → validate → notify by CHES → call back. The "start here" template for a ministry that has documents and no pipeline. This is the artifact to hand **the ENV team and Enterprise Architecture**, who asked on 2026-08-05 for examples and case studies in use. | Nov 10–21 |
| D.3 | **CHEFs form attachment → extract → write back to the submission.** A citizen attaches a document to a CHEFs form; the platform extracts the fields and populates them back, so nobody rekeys them. The bridge your own 2025-10-31 prototyping notes named as the *first* integration to build, still unbuilt. **Gated on C.4, which is gated on the CHEFs team.** | Nov 24 – Dec 12 |
| D.4 | **Invoice automation** — extract → validate totals → hand off. Grounded in **AI-1225 "CITZ Partnership — Invoice Automation"**, a live partnership, rather than in a vendor gallery. | Dec 8–19 |

**Done when:** someone from another ministry can open the gallery, pick a pipeline that
resembles their problem, and run it against their own documents.

### E — Handover readiness · Aug 11 → Dec 12, hard stop

| Step | What | When |
|---|---|---|
| E.1 | **Un-Alex the AI agent.** The model picker defaults to Azure GPT-5.4, which only you can call. Establish what BC Gov APIM actually exposes and repoint it. **This is a genuine blocker** — batch-four item 23 — and it has an external dependency with no owner today. Start the APIM question in August, not November. | Aug 11 – Sep 30 |
| E.2 | **Transfer admin** on OpenShift, Azure, GitHub and SSO to Andrew and Sandeep. Agreed 2026-07-21, not yet done. | Sep |
| E.3 | **Cold-setup verified by someone who didn't build it.** Sandeep's README branch is the vehicle; the fresh-setup login 500 (Keycloak token mismatch) is open and blocks his onboarding PR. Also settle the Docker Desktop licensing question with Jenny Romero. | Aug – Oct |
| E.4 | **Runbooks:** deploy, database restore, key rotation. **AI-1859** (API key rotation — generated tokens currently have no expiry, so none can be retired) belongs here, owned by Sandeep. | Oct – Nov |
| E.5 | **Docs sweep.** The `docs-md/` audit is 32 of 88 done (branch `AI-1296-docs-sync`). Finish it, since the docs *are* the handover. | Nov – Dec 5 |
| E.6 | **Hand over the written backlog**, not just the code: the 57 gap-register entries, the 12-wave capability plan (merge that branch or move the four files onto `develop` — one unmerged commit is how planning gets lost), the un-built gauntlet pipelines, and the four items deliberately not fixed (G-031 edge half, G-036 untaken-switch half, G-052, G-034). | Dec 8–12 |

**Done when** a competent new team can set up, run, deploy and extend without
contacting you. Test it by having Andrew or Sandeep do exactly that, in November, while
you are still around to see it fail.

---

## 5. Critical path and the four things that break this

**Critical path:** PR #230 → everything. Then two chains run in parallel and converge on
D: **B.0 design → B.3 build → D** on the frontend side, and **C.0 conversations →
C.1 transport → C.3/C.4 connectors → D** on the backend side. D cannot start before both
arrive, which is why C.0 sits in September rather than alongside C.1.

### Risk 1 — PR #230 gets bigger every day it waits

563 commits, 1,194 files, and the split plan is already three times out of date. Every
week of delay makes both options worse. **This needs deciding in August**, and it is the
one item on this roadmap that only you can unblock.

### Risk 2 — workstream B has no design, and it gates D

If B.0 slips past end of September, B.3's migration lands in November, and D has to
build sample workflows against a taxonomy that is still moving. **Mitigation:** B.0 is
scheduled to overlap A's tail deliberately — it is design work, it doesn't need the
branch merged, and the reviewer is available now.

### Risk 3 — E.1 has an external dependency and no owner

If BC Gov APIM turns out not to expose a model suitable for the authoring agent, the AI
agent ships as a feature only you can use. That fails the handover bar on a feature that
took a whole phase to build. **Mitigation:** ask the APIM question in August. The answer
is either fine or it isn't, and finding out in November is the bad version.

### Risk 4 — half of C depends on people outside this team saying yes

The CHEFs connector needs the CHEFs team. The real ICM handoff needs a ruling reversed
that Loren made on 2026-08-04. Neither is a code problem and neither is yours to decide
alone. If both answers come back no, C loses C.4 and D loses D.1 and D.3 — half the
sample workflows. **Mitigation:** C.0 puts those conversations in September, ahead of
any code, and C.2 (the completion callback) plus C.3 (CHES) depend on nobody and can
absorb the freed time.

### What I'd cut, in this order

1. D.4 invoice automation (the fourth sample; AI-1225 is a partnership, not a deadline)
2. C.5 geocoder lookup (nice, not load-bearing — and it can ship as a dynamic node
   with no deploy, which is nearly free)
3. B.3 composite nodes and migration (keep the naming and categories; the three-node
   OCR sequence survives, which is a real loss but not a blocking one)
4. D.3 CHEFs pipeline and C.4 CHEFs connector — **only if C.0 comes back no.** Not a
   scheduling cut; a dependency cut.

**Never cut:** E in its entirety, A.2 (e2e in CI), and C.2 (the completion callback).
The first two are what makes everything else survivable after you leave. The third is
the difference between a platform other ministries can integrate with and one they have
to poll.

---

## 6. The Jira tree

**Nothing below has been created.** This is the proposed structure for your approval.

### What's there now, and what happens to it

| Ticket | Today | Proposed |
|---|---|---|
| **AI-1281** "Workflow builder enhancements" (Epic, To Do) | Holds 6 stories, no description | **Close as superseded** once its stories are redistributed |
| AI-1280 "separate external and internal parameters" | Story under AI-1281 | → Epic **B** (it is the parameter-exposure half of the restructure; `ACTIVITY_PARAMETERS_AUDIT.md` is its design) |
| AI-1282 "node type enforcement" | Story under AI-1281 | → Epic **B** (port typing / the `Artifact` wildcard) |
| AI-1283 "wizard abstraction" | Story under AI-1281 | → Epic **B** |
| AI-1284 "templates" | Story under AI-1281 | → Epic **D** |
| AI-1285 "categories" | Story under AI-1281 | → Epic **B** — this *is* the restructure ask |
| AI-1286 "next/before suggestions" | Story under AI-1281 | **Close as done** — auto-wire and hover-extend ship exactly this |
| **AI-1174** "Implement new workflow designer" (Story, In progress, yours) | **Orphan — no parent epic** | → re-parent under Epic **A** |
| AI-1138 "Outbound Webhook Node for ICM Submission" | Orphan story | → Epic **C**, closed by C.1 |
| AI-1211 "Add template alignment activity" | Orphan story | → Epic **C** backlog |
| AI-1194 "Create better designs for the workflow editor" (Blocked, the reviewer) | Orphan | → Epic **B**, unblocked by B.0 |
| AI-1920 "Workflow designer manual test pass" (In progress, the reviewer) | Orphan | → Epic **A**, covers A.4 |
| AI-1669 "Review new workflow branch features" | Orphan | → Epic **A**, covers A.1 |
| **AI-1963** "SDPR project handover" (Epic, empty) | No description, no assignee, no children | → **becomes Epic E**, fill it in |
| AI-1859 API key rotation | (per work store, Sandeep's) | → Epic **E** |

### The four new epics

**Epic A — Workflow designer: complete, verify and merge**
- Decide and execute PR #230 (land as one vs split) — *A.1, closes AI-1669*
- Add a Playwright job to `.github/workflows/` and triage the failing specs — *A.2*
- UX review batch four: 28 remaining items — *A.3* (split into 4 stories by
  theme: canvas and ports · error handling · Try/Run and preview · top bar and switcher)
- Rule on batch-four item 20: port/wire colour vocabulary and the non-colour carrier — *A.3, yours*
- Walk the remaining 29 manual-test checks and 3 Layer-0 checks — *A.4, closes AI-1920*
- Seed demos D5 and D6 — *A.4*
- Soft delete for classifiers and prompts, plus the Azure reconciliation cron — *A.5*
- Publish the gap register as a handover backlog — *A.6*
- *(re-parented: AI-1174, AI-1669, AI-1920)*

**Epic B — Workflow nodes: restructure for usability**
- Write the node-restructure design with the reviewer — *B.0, unblocks AI-1194*
- Plain-language labels and descriptions across all 37 palette nodes — *B.1*
- Stop exposing internal ids in the palette, type-swap modal and hover-extend — *B.1*
- Rebuild the category set and retire the dead `Flow Control` entry — *B.2, closes AI-1285*
- Composite Azure OCR and Azure classify nodes, with the granular steps demoted — *B.3*
- Migration and version bump for saved workflows — *B.3*
- Parameter exposure pass: expose / advanced / hide — *B.1, closes AI-1280*
- Port typing: reduce the `Artifact` wildcard, sync the two stale kind mirrors — *closes AI-1282*
- Rewrite `WORKFLOW_NODE_CATALOG.md` — *B.4*
- *(re-parented: AI-1280, AI-1282, AI-1283, AI-1285, AI-1194)*

**Epic C — Workflow nodes: BC Gov ecosystem connectors**
- Confirm the CHEFs, ICM and APIM integration targets — *C.0, three conversations, yours*
- `http.request` node — *C.1, closes AI-1138*
- Run-completion callback / outbound webhook — *C.2*
- CHES send node (Common Hosted Email Service) — *C.3*
- `source.chefs` webhook source node — *C.4, gated on C.0*
- CHEFs submission fetch and field write-back — *C.4, gated on C.0*
- BC Address Geocoder lookup node — *C.5*
- Land the capability plan onto `develop` so it isn't stranded on an unmerged branch — *E.6*
- *(backlog, if C leaves room: generic rule/validation node · per-field confidence gate ·
  standalone `llm.structured`)*
- *(re-parented: AI-1138, AI-1211)*

**Epic D — BC Gov sample workflows and capability gallery**
- SDPR monthly report with a real ICM handoff — *D.1*
- Ministry intake starter template — *D.2, the artifact for ENV and Enterprise Architecture*
- CHEFs form attachment → extract → write back — *D.3, gated on C.4*
- Invoice automation pipeline — *D.4, ties to AI-1225*
- Gallery and library entries for each, plus benchmark fixtures — *throughout*
- *(re-parented: AI-1284)*

**Epic E — AI-1963, SDPR project handover**
- Repoint the AI agent at a model BC Gov actually exposes — *E.1, blocker*
- Transfer OpenShift, Azure, GitHub and SSO admin to Andrew and Sandeep — *E.2*
- Fix the fresh-setup login 500 and land Sandeep's onboarding README — *E.3*
- Confirm the Docker Desktop licensing position with Jenny Romero — *E.3*
- Cold-setup dry run performed by Andrew or Sandeep, in November — *E.3*
- Deploy, restore and key-rotation runbooks — *E.4*
- API key rotation with expiry and non-disruptive turnover — *E.4, AI-1859*
- Finish the `docs-md/` audit, 32 of 88 done — *E.5*
- Hand over the written backlog: gap register, 12-wave plan, un-built pipelines — *E.6*

---

## 7. What this roadmap does not cover

Named so they're decisions rather than oversights.

- **Waves 2–12** of the capability plan. Handed over as paper.
- **The Part 6 vendor-gallery pipelines** — receipt, bank statement, passport, mortgage
  packet, W-2, bill of lading, contract, health claim. Superseded by the BC Gov set in D.
  The list stays in the handover pack as a menu for whoever comes next.
- **CDOGS, COMS and BC Data Catalogue connectors.** Real BC Gov common services, no
  demand behind them yet. If a partner asks, they follow the same pattern as C.3.
- **Phase 5**, the document-segmentation node pack. No requirements exist; it belongs to
  whoever picks up Wave 6.
- **The 57 open gap-register entries.** Written backlog, per assumption 1.
- **Production release (AI-1246)** and the SDPR production migration. Live work with its
  own timeline, running in parallel and not gated on any of this.
- **The other 8 open tickets in the Document Intelligence stream** — folder watcher
  review (AI-1622), Azure SRE integration (AI-1293), encryption at rest (AI-1247),
  experiment follow-ups (AI-1641, AI-1648), deployment decommission (AI-1207). These
  stay where they are; several are handover-relevant and should be re-parented under
  Epic E if you want them tracked against the year-end date.
