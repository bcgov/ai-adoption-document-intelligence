# The 24 Fixes, Explained

A plain-language walkthrough of every gap approved for fixing at the 2026-07-25 disposition gate.

The [gap register](GAP_REGISTER.md) is written for whoever implements the fix. **This document is written for whoever has to decide whether it's worth fixing.** Same 24 items, no code required.

---

## First: the eight words you need

Everything below is built from these. If a fix confuses you, it's probably because one of these isn't landing — come back here.

**Node** — one step on the canvas. "Read this PDF", "split into sections", "wait for a human".

**Port** — a named input or output socket on a node. `azureOcr.extract` has an input port called `blobKey` and an output port called `ocrResult`. Ports are how a node says what it needs and what it produces.

**Variable (`ctx` key)** — a named slot where a value lives while the workflow runs. Think of it as a labelled box: one node puts something in, another takes it out. The whole set of boxes is called "ctx" (context) in the code.

**Binding** — the statement "this node's `blobKey` input reads from the variable named `preparedFile`". A binding connects a port to a variable. It is *not* the line you see on screen.

**Wire** — the line you see on screen. It's drawn *from* the bindings. This distinction matters more than it sounds: a binding can exist with no wire, and a wire can be drawn where the binding is broken.

**Kind** — the type of a value: `DocumentRef`, `OcrResult`, `PreparedFile`. Kinds are how the builder knows a blob key can't be plugged into a slot expecting extracted text.

**Run** — one execution of the workflow. **Replay** is looking at a past run's results overlaid on the canvas.

**Cache** — saved outputs from previous runs, so re-running doesn't redo expensive work (OCR especially). It's also what powers the little preview cards on each node.

Two more that only appear in a couple of places:

**Lineage** — all versions of one workflow, treated as a single thing. Version 1 and version 7 of "Invoice Extract" share a lineage.

**Signal** — a message sent into a *running* workflow from outside. It's how "a human approved this" reaches a workflow that's sitting and waiting.

---

## How the 24 break down

| Group | Count | The one-line version |
|---|---|---|
| **A · Things that lie to you** | 5 | The screen says fine; it isn't |
| **B · Cheap but serious** | 3 | Hours of work, severe consequences |
| **C · Features with no way in** | 4 | The engine supports it; nothing lets you set it |
| **D · Losing your work** | 2 | No undo, no save guard |
| **E · Can't see what happened** | 6 | Debugging a run is largely impossible |
| **F · Can't find anything** | 2 | Fine at 5 nodes, painful at 40 |
| **G · Broken connections to other systems** | 2 | Human review and library workflows |

Ordered below by the sequence I'd actually do them in, not by severity.

---

## Group A · Things that lie to you

**Do these first.** Not because they're the worst bugs, but because while they're outstanding, *every hour you spend manually testing is against a screen that may be lying.* You can't trust a clean badge until these are fixed, which makes all other testing provisional.

### G-002 — A deleted producer leaves consumers reading "satisfied"

**Supposed to happen:** you delete the node that produces `ocrResult`. Everything downstream that reads `ocrResult` should immediately complain — the value no longer comes from anywhere.

**Actually happens:** nothing complains. No badge, no warning, no problem in the drawer. The workflow saves cleanly. It fails at run time, or silently produces `undefined`.

**Why it matters:** this is the single most common thing you do while iterating — delete a node and rebuild that part. The builder's job is to tell you what you just broke, and here it stays quiet.

---

### G-005 — A "pinned" connection skips all checking

**Context you need:** connections come in two flavours. **Automatic** ones the builder works out for you, and **pinned** ones where you explicitly said "no, read from *this* specific thing." Pinning exists so the builder won't second-guess you.

**Supposed to happen:** pinning should stop the builder *changing* your choice. It shouldn't stop it *checking* your choice.

**Actually happens:** the moment a connection is pinned, the code returns "healthy" without verifying either that the source still exists or that its type matches. Pinning silences the checks entirely.

**Why it matters:** it's a trap that gets worse the more deliberate you are. The more you pin things — the more carefully you author — the less checking you get.

---

### G-013 — The map's collection is invisible to the whole binding system

**Context you need:** a "map" node is *do this for each item in a list*. The list it iterates is set by a binding like any other port — except it isn't treated like one.

**Actually happens:** `collection` has no type, no row in the settings panel's inputs list, no wire on the canvas, and no state indicator. Nothing tells you whether it was auto-wired, pinned, or is now pointing at nothing. It's also filled in exactly once: if the producer is later deleted, the map never re-resolves and never notices.

**Why it matters:** it's the single most important binding on the node — it decides what the loop runs over and how many times — and it's the one binding with no visibility at all. Delete its producer and every node inside the loop becomes unsatisfiable, silently.

---

### G-018 — The cache can hand a node another activity's output

**Context you need:** the cache remembers "for this node, with these settings and these inputs, the answer was X." The identifier it uses is built from the workflow, the node's id, its parameters, and its inputs.

**What's missing from that identifier: which activity the node actually is.**

**Actually happens:** change a node from "Extract OCR" to "Classify Document" and it keeps the same id. The cache doesn't notice the change, and can serve the OCR answer to the classifier for up to 24 hours. Node ids are also recycled — delete a node and add a new one, and it can inherit the dead node's id and its cached results. The preview card and status badge both read from that same cache, so they cheerfully confirm the wrong answer.

**Why it matters:** it's wrong output that every surface agrees is correct. There is no way to catch it by looking.

**Note:** this is engine-side, not UI. The fix is adding the activity type to the cache identifier and clearing entries when a node is deleted or retyped.

---

### G-019 — A shared workflow can be deleted out from under everything using it

**Context you need:** workflows can be published to a library and called by other workflows, like a shared function.

**Actually happens:** delete the library workflow and every parent still validates green. There's no database link between them — the reference is buried in a JSON blob — so nothing counts who's using it before deleting. The only hint is an orange line inside one settings box, visible only if you happen to open that specific node. At run time the parent fails, retries its whole budget against an error that will never resolve, then fails.

**Why it matters:** the destructive action happens on a *different workflow* than the one that breaks. You'd never connect cause to effect.

---

## Group B · Cheap but serious

Small changes, large consequences. Do them early because they cost almost nothing.

### G-021 — Starting any run cancels every other run of that workflow

**What happens:** every run start first cancels all other in-flight runs of the same workflow. Feed in 240 documents and document #2 cancels document #1 mid-OCR. You end up with one result.

**Why it's like that:** it's correct behaviour applied too broadly. When you hit "Try" in the editor, cancelling your previous preview is right — you don't want stale runs piling up. But the query that finds "runs to cancel" only knows *which workflow*, not *whether it was a preview or a real job*. So the production API endpoint inherits preview behaviour.

**The fix:** one additional condition to distinguish a preview run from a real one. The comment in the code already states the intent correctly; the query just can't express it.

---

### G-026 — One bad page destroys the whole document

**Context:** when a map node runs 300 pages, it waits for all 300 branches.

**Actually happens:** it waits using a method that abandons everything the moment any single branch fails. One unreadable page and all 299 good results are discarded.

**The fix:** the sibling method that waits for all branches and reports each one's outcome separately. Roughly a one-word change, plus deciding how a partial result should be presented.

---

### C-071 — Two invisible characters break search across the whole feature

**What happens:** `WorkflowEditorCanvas.tsx` — the biggest and most-edited file in the builder — contains two raw NUL bytes on line 2745. Someone used NUL as a separator inside a text template and typed the actual byte instead of the escape code for it.

**Consequence:** `grep`, `ripgrep`, and most search tools classify the file as *binary* and return **nothing**, silently, with no error. Searching for something that's in the file looks identical to it not being there.

**Why it matters:** it already caused a false conclusion during this very investigation — one pass reported that run animation was completely dead, which was wrong; the code was there, the search just couldn't see it. Every developer and every tool pointed at that file has been silently degraded.

**The fix:** two characters.

---

## Group C · Features with no way in

The engine supports these. The editor provides no way to set them. In each case something already reads the setting — which is why they went unnoticed.

### G-001 — Error handling can't be authored at all

**Found independently by three of the four passes** — the only gap that scored that.

**Context you need:** every node can declare what happens on failure: stop the workflow, skip the node, or divert down a special "error" path. That last option is why you sometimes see a red edge — it's one of three kinds of connection the model supports.

**Actually happens:** nothing in the editor writes this setting. The engine honours it, the canvas draws the handle when it's set, the validator checks its edge, node-swap carefully preserves it — and no form anywhere sets it. So the red error handle never appears on any node you built, and you cannot draw an error path.

**It gets worse if the setting arrives another way** (via a template, the API, or the AI agent): dragging from the error handle creates the edge but never records *which* edge is the error route. The validator then reports a permanent error, and clicking it takes you to a settings panel that has no error-handling section. The workflow can be opened but never saved again.

**Proof it was never noticed:** manual test plan step 5.2 begins *"On a node with `errorPolicy.onError = "fallback"`…"* — it assumes you're already in a state the product cannot produce. That step has never been runnable by anyone who didn't hand-edit JSON.

**Also affected:** retry counts and timeouts are in exactly the same position.

---

### G-007 — Half the node types declare no outputs

**Actually happens:** of eight node types, only two declare what they produce. Sources, maps, joins, switches, human gates, and sub-workflows all return "no outputs" when asked.

**Consequences:** nothing downstream of them can be auto-connected — you must wire it by hand every time. And a human gate's approval payload can't even be *named*, so nothing downstream can read what the reviewer decided.

**A wrinkle:** the canvas disagrees with the engine here. It special-cases upload and API sources so it *can* draw their wires. So "what counts as a producer" is defined twice, in two places, with different answers. A code comment defers reconciling them to "Tasks 13–15" — which is a plan, not a decision.

---

### G-015 — Sub-workflows written inline get none of the builder

**Context you need:** a sub-workflow node can point at a library workflow, or contain one directly ("inline").

**Actually happens:** the entire editing surface for an inline sub-workflow is a plain text box containing raw JSON, with the hint "Edit the inline child graph as JSON."

Inside that box there is no palette, no canvas, no ports, no auto-wiring, no type checking, no preview, and **no validation of any kind**. It is the same kind of object as the outer workflow, one level down, and every rule the product enforces is dropped.

**Why it matters:** this is the one place where the premise of a visual editor — that you build graphs visually — is abandoned.

---

### G-017 — Human gates ship with a name that can never work

**Context you need:** a human gate pauses until a message arrives naming that specific gate. The name has to match on both sides.

**Actually happens:** drag out a new human gate and the name is **empty**. Nothing validates it, so it saves clean and creates a gate that literally nothing can ever open.

If you do fill it in, the dropdown offers four suggestions — and only one of them (`humanApproval`) is ever sent by anything in the system. Picking any of the other three, from a list the product itself offers you, produces a gate nothing can resume.

**Why it matters:** it's a small fix that removes a trap where following the product's own suggestion is wrong three times out of four.

---

## Group D · Losing your work

### G-003 — No undo, anywhere

**Actually happens:** there is no undo or redo in the workflow editor. Not for deleting a node, not for changing its type, not for any edit.

**The sharpest detail:** deleting a *group* — the mildest, most reversible action available — is the only one that asks for confirmation. Deleting a node, which cascades into other nodes' connections, asks nothing.

**Approved as a full undo/redo system** rather than the cheaper "just add confirmation dialogs" option.

---

### G-027 — Closing the tab silently discards everything

**Actually happens:** reload the page or hit back, and the entire editing session is gone. No prompt, no draft saved.

**The detail that makes it fixable cheaply:** the page *already tracks* whether you have unsaved changes — it uses that flag to stop background refreshes from overwriting your edits. The information exists and simply isn't used to protect you.

Approved to be built together with G-003, since they share that machinery.

---

## Group E · Can't see what happened

The largest group and the biggest build. This is the cluster that makes debugging a bad run nearly impossible.

### G-022 — Previews show a file pointer, never the actual values

**Actually happens:** the preview card on an OCR node shows a *reference to where the result is stored*, not the extracted text or fields. The values a workflow exists to produce are never visible in the builder.

**Why it matters:** you cannot answer "did this step work?" by looking. And it removes the entire method you'd use to debug a wrong result — checking each step's output to find where things went off.

Approved as **full fix**: values must be visible.

---

### G-004 — Replay shows old results on the current diagram

**Actually happens:** replaying a past run matches results to nodes *by id* and paints them onto whichever version of the workflow is currently on screen. It never loads the version that actually ran. Stale results are never cleared.

**Why it matters:** if you've edited the workflow since — which is the normal reason you're looking at an old run — you're reading yesterday's results on today's diagram. Nodes that didn't exist then show status; nodes that were deleted vanish along with their results. The version number is displayed right there in the run list, which makes it look deliberate.

---

### G-024 — Yesterday's run has nothing left to look at

**Actually happens:** intermediate values are kept for 24 hours, then deleted. A run from yesterday shows "cache evicted" on node after node.

The offered remedy is a **Re-run** button — which starts a fresh run against the *current* workflow (compounding G-004), appears in history as a new official result, and, until G-021 is fixed, cancels anything else running.

**Why it matters:** "the run happened yesterday" is the single most common debugging situation there is.

---

### G-011 — Previews show only the first output, for a third of value types

Four problems in one surface:

- A node with several outputs shows only the **first**. The rest are invisible during a run with no way to switch — despite the canvas drawing a separate row per output.
- Roughly **two-thirds of value types have no preview renderer** and produce a blank card.
- The blank card doesn't say *why* it's blank.
- The workaround (hovering a wire) only works where a wire was drawn, so an unused second output can't be inspected at all.

---

### G-012 — "This step didn't run" means four different things

**Actually happens:** one sentence covers *waiting to start*, *currently running*, *cancelled*, and *this branch was never taken*. Those are completely different situations — one means wait, one means look elsewhere, one means the workflow is over.

The code comment admits the conflation. The same concept has two different names in two places, no defined type, and six loose text values between them.

**And it isn't shown during a live run at all** — the honest message only appears in replay. While a run is actually happening, you get a blank.

---

### G-014 — The path a run took is never shown

**Actually happens:** the canvas highlights an edge only while the node feeding it is *currently running*. In a replay every node has finished, so **nothing is ever highlighted** — you can't see which branch was taken.

The engine *does* record which branch it chose. That information simply isn't exposed anywhere.

**Why it matters:** "which way did it go?" is the first question about any workflow with a branch in it.

---

### G-010 — Clicking a problem doesn't take you to it

**Actually happens:** three failures stacked:

1. Clicking a problem tries to select the node using a method the page's own code comment says doesn't work — and the working version exists right next to it, used by a neighbouring feature.
2. Nothing scrolls the canvas, so even when selection works the node may be off-screen.
3. Of 32 kinds of problem location, only **2** carry a link at all. The other 30 — including ones naming a specific edge, group, or variable — silently degrade to "somewhere in this workflow."

**Why it matters:** the validation drawer accumulated **29 findings**, more than any other surface in the register. The thing whose job is to tell you what's wrong is the most broken thing in the builder.

---

## Group F · Can't find anything

### G-009 — No way to find a node, or ask what uses a value

**Actually happens:** there is no search for nodes. The only search box in the editor searches the *palette* — the catalog of things you can add — not your workflow. And there's no way to ask "what else reads this variable?" before you change it.

**Why it matters:** invisible at 5 nodes. The master template is 16. Real workflows go past 40.

---

### G-016 — Poll-until nodes lose their connection points

**Actually happens:** a "wait until condition" node wraps a normal activity, but renders through the plain-rectangle path used for control-flow nodes. Its inputs appear in the settings panel and in the problem badge — but there are no handles on the canvas to drag to.

Same node, two surfaces, opposite answers. And if the wrapped activity is later removed from the catalog, the card looks completely normal — where a normal node would show a "?" and the words "Unregistered activity."

---

## Group G · Broken connections to other systems

### G-020 — Human review can never actually resume a workflow

**How it's supposed to work:** workflow hits a human gate → document appears in the review queue → reviewer approves → a message goes to the waiting workflow → it continues.

**Actually happens: two independent breaks, either one fatal.**

1. The review queue's approve action **sends no message to the workflow at all.** It marks the document complete locally and stops.
2. The one endpoint that *does* send the message needs the run's id — and the upload handler saves that field as empty. So even that path fails.

**Result:** the document reaches the queue, the reviewer approves it, and the workflow keeps waiting until it times out an hour later and fails.

**Why it matters:** human-in-the-loop is a headline capability, and it is broken end to end. Both halves must be fixed — either alone leaves it broken.

---

### G-008 — Renaming a variable doesn't rename it everywhere

**Actually happens:** renaming a variable updates most references but misses two: paths into library workflows, and variables produced by source nodes. Those references keep the old name and are quietly disconnected.

**Why it matters:** the rename dialog states that it updates all references. It doesn't, and it doesn't say which it skipped.

---

## Suggested order

| Stage | Items | Why here |
|---|---|---|
| **1 — today** | C-071 | Two characters. It's degrading every search tool, including ones needed for the rest of this work. |
| **2** | G-021, G-026 | Hours each, severe consequences. |
| **3** | G-002, G-005, G-013, G-018, G-019 | Until these are fixed you cannot trust a clean screen — which makes all manual testing provisional. |
| **4** | G-001, G-017, G-007 | Unlocks error handling, and makes test-plan step 5.2 runnable for the first time. |
| **5** | G-003 + G-027 | One durability workstream; they share the same machinery. Own PR. |
| **6** | G-020, G-008, G-019 follow-through | Cross-system connections. |
| **7** | G-022, G-004, G-024, G-011, G-012, G-014, G-010 | Biggest build. Own PR. Do last — least likely to mislead you while outstanding. |
| **8** | G-009, G-015, G-016 | Quality-of-life; real but not blocking. |

---

## Deferred (3)

Recorded, not being fixed here — these are capabilities to build rather than defects to repair, and they belong together in a **batch-processing epic**:

- **G-023** — there is no concept of a batch at all: no grouping of runs, no aggregate done/running/failed counts, no unit above a single run.
- **G-025** — file intake is strictly one file per upload; no multi-file or folder affordance exists anywhere.
- **G-006** — above 20 items a map switches to a different execution strategy and re-enters at the wrong point, so nested control flow behaves differently at scale.

They're related: G-023 and G-025 are what "process 240 documents" actually needs, and G-006 is the bug you'd hit immediately once you could.

---

## What isn't in this document

**76 further findings.** The disposition gate covered only the 27 entries that were either severe or independently corroborated. The rest are real but lower-stakes, and currently carry whatever disposition the pass that found them proposed. They're in [GAP_REGISTER.md](GAP_REGISTER.md) and can be pulled into scope at any point.

**12 deliberate non-goals** are also recorded there — things decided *not* to support, written down so they stop being rediscovered.
