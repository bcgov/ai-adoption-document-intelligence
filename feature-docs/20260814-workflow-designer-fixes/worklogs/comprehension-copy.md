# Comprehension gaps — the app was right and would not say so

Worklog for **D21, D22, D23, D24, D26, D27, D29, D30, D32**, plus the **D3
residual** picked up mid-pass. Every one of these is a case where the behaviour
was already correct and the surface left the reader to guess. Several are
questions the reviewer asked outright, so the **answer is part of the
deliverable** and leads each section.

**Scope note.** `apps/frontend/src/features/workflow-builder/canvas/**` was
owned by another agent this pass. Three fixes have a canvas half; those halves
are written up as **requests** at the end, with the exact before/after strings,
rather than edited.

---

## D3 (residual) — the editor still said "see error markers" for a failure that has none

### The answer

The backend was changed earlier today: when the custom-node checker
(`deno-runner`) is unreachable it now returns **503** with two separate fields —
`message`, a sentence a person can act on, and `details`, the endpoint
diagnostic that used to *be* the message
(`apps/backend-services/src/dynamic-nodes/dto/deno-runner-unavailable-response.dto.ts`,
`deno-runner.client.ts:43-70`).

The editor had not caught up, and was wrong twice over. It appended
`" — see error markers"` to **every** publish failure, and for an unreachable
checker there are no markers at all: the client-side reparse that produces them
runs over a script that is perfectly valid — the *service* is what failed. It
also ignored `details` entirely, so the one piece of information a developer
needs never reached the screen.

### What changed

| File | Line | Change |
|---|---|---|
| `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.tsx` | 114–138 | new `extractFailureDetails(err)` — lifts `body.details` off the 503 |
| same | 237–248 | new `publishFailure` state (message · details · markerCount) + `failureDetailsOpen` |
| same | 274–310 | the catch block: markers computed **first**, and the marker sentence appended only when `markers.length > 0` |
| same | 447–500 | a persistent `Alert` with the sentence, an optional marker-count line, and an expandable **Show technical details** block |

The alert is persistent on purpose. A notification is gone in four seconds; a
failure whose remedy is "start this service and publish again" has to survive
long enough to be acted on.

### Before / after

Before (`DynamicNodeEditor.tsx`, old line 255):

```
message: `${message} — see error markers`,
```

After — notification:

```
message:
  markers.length > 0 ? `${message} — see error markers` : message,
```

After — the new alert, when markers *do* exist:

> **1 problem is marked in the editor below.**

and when they do not, that line is absent entirely.

The details block, collapsed:

> Show technical details

expanded:

> `POST http://localhost:9099/check could not be reached: fetch failed`

### Verified against a real 503

Playwright, intercepting `PUT /api/dynamic-nodes/demo-uppercase` with the
backend's exact new body. Live readout:

```
alert present: 1
D3 alert: "Publish failedThe custom-node checker is not running, so this script
 could not be type-checked. Start it with the local deno-runner compose file,
 then publish again.Show technical detailsPOST http://localhost:9099/check
 could not be reached: fetch failed"
markers line present: 0
details: "POST http://localhost:9099/check could not be reached: fetch failed"
```

`markers line present: 0` is the fix: the failure no longer claims markers it
did not produce. The green **Signature OK** strip stays green throughout, which
is also correct — the script never was the problem.

Two tests added to `DynamicNodeEditor.spec.tsx` (the 503 path and the 400
path). Note the second: a 400 that *does* carry structured errors still says
"— see error markers" and still grows the marker-count line, so the fix
narrowed the claim rather than removing it.

**Kept separate from D26.** D3 touches `DynamicNodeEditor.tsx` only; D26
touches `CodePane.tsx` only. No shared hunk.

---

## D21 — pinned inputs have no incoming edge, so who chose the value?

### The answer

> *"The docs say someone chose it deliberately, but is that someone the user or
> a developer?"*

**Both, and the app cannot tell which — which is exactly why the old copy was
wrong.** The tooltip said **"Pinned by you"**, and on every seeded demo
workflow the reviewer was looking at, that is false.

The mechanics. A pin is two pieces of state, never a literal on the binding:

- `node.inputs[] = [{ port, ctxKey }]` — the reference. `PortBinding` has
  exactly one variant (`packages/graph-workflow/src/types.ts:190-193`); a
  `{ port, value }` sibling was explicitly rejected.
- `node.metadata.lockedInputPorts: string[]` — the lock that tells auto-wire to
  keep its hands off (`packages/graph-workflow/src/auto-wire/lock-list.ts`).

That list holds **port names and nothing else** — there is no author, no
timestamp, no provenance. So the app has no basis on which to say "you".

Where the value comes from, decided by the ctx key's shape
(`settings/input-row-resolution.ts:50-79`):

| ctxKey | meaning |
|---|---|
| `__auto.<node>.<port>` | a reference to another node's output |
| `__const_<node>_<port>` | a literal, stored as a hidden `ctx` declaration's `defaultValue` |
| anything else | a hand-authored workflow ctx variable |

Who can pin, in the editor: four gestures, all writing through
`pinPortBinding` (`canvas/wire-mutations.ts:56-107`) — the settings panel's
source picker, a canvas port-to-port drag, hover-extend node placement, and
typing a literal into the row.

**And the case that made the copy a lie.** A workflow authored elsewhere — a
seed, a template, the AI agent — writes explicit `inputs[]` bindings. On load,
`normaliseLocks` (`packages/graph-workflow/src/auto-wire/normalise-locks.ts:9-49`)
*infers* `lockedInputPorts` from every non-`__auto.` binding. The reviewer's own
screenshot (`screenshots/before/D30-extract-ocr-fields.png`) shows five inputs
all badged **PINNED** on a workflow he had never edited, each one telling him he
had done it.

So the honest statement is about the **act**, not the actor.

### What changed

`apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx`

| Line | Change |
|---|---|
| 513–531 | the `locked` badge's tooltip, now a full sentence, varying by pinned source |
| 698–707 | the constant-value badge's tooltip, same correction |

### Before / after

**Pinned badge** — before (line 514):

> Pinned by you

after, when the pin points at a producer node:

> Pinned — someone editing this workflow chose this source by hand, so automatic wiring leaves it alone. Change it or hand it back with the ⋯ menu.

after, when it points at a ctx variable:

> Pinned — someone editing this workflow chose this source by hand, so automatic wiring leaves it alone. The value arrives in this workflow variable at run time. Change it or hand it back with the ⋯ menu.

**Value badge** — before (line 681):

> A value you typed here

after:

> A fixed value written into this workflow, not produced by an earlier step. Edit it in the field below, or publish it as a workflow input from the ⋯ menu.

Both name the undo (`⋯` menu), which the old two-word tooltips did not.

### Test output

New test in `InputsSection.test.tsx`, hovering the badge for real:

```
✓ explains a pin without asserting who made it
Test Files 1 passed (1) · Tests 41 passed (41)
```

Live readout from the running app, `🎯 Demo — Control-flow forms` ▸ **Extract
OCR Results**:

```
panel pinned badges: 2
D21 tooltip: "Pinned — someone editing this workflow chose this source by hand,
 so automatic wiring leaves it alone. The value arrives in this workflow
 variable at run time. Change it or hand it back with the ⋯ menu."
legacy copy present: 2
```

`legacy copy present: 2` is the canvas half — see **Requests for the canvas
owner**, item 1.

---

## D22 — the Ref picker doesn't read as "previous nodes and their outputs"

### The answer

It is exactly that, and it always was. `ConditionProducerPicker` walks
`upstreamNodesWithDistance(config, currentNodeId)`, keeps the `activity` and
`pollUntil` nodes, and emits one row per catalog **output port**, sorted
nearest-first. No kind filter — a condition may legitimately read a scalar out
of any output.

What made it unreadable was not the rows, which already carry node, port, kind
and distance. It was that nothing above them said what the list *was*, and the
mode switch offering it was labelled **"Ref"** — a name for the mechanism, not
for the choice.

### What changed

| File | Line | Change |
|---|---|---|
| `graph-widgets/ConditionProducerPicker.tsx` | 79–92 | a heading block above the rows |
| `graph-widgets/ConditionExpressionEditor.tsx` | 918–933 | the Ref/Literal segmented control relabelled |

Rows themselves are untouched — the item asked not to hide detail that is
already useful.

### Before / after

**Mode switch** — before:

```tsx
{ value: "ref", label: "Ref" },
{ value: "literal", label: "Literal" },
```

after:

```tsx
{ value: "ref", label: "From a step" },
{ value: "literal", label: "Typed value" },
```

**New heading** above the list:

> **Outputs of earlier steps**
> Each row is one output of a step that runs before this one — step name, then the output it produces.

A row still reads, unchanged:

> Submit to Azure OCR → Request ID
> apimRequestId · RequestId · 2 steps upstream

### Test output

```
✓ names what the list is, above the rows
✓ toggling to Literal then editing emits { literal } only …   (updated labels)
Test Files 3 passed (3) · Tests 15 passed (15)
```

Live, `🎯 Demo — Conditions from node outputs — step picker (Part 4)`:

```
heading: "Outputs of earlier stepsEach row is one output of a step that runs
 before this one — step name, then the output it produces."
D22 mode control: "From a stepTyped value"
```

---

## D23 — operator dropdown uses developer shorthand

### The answer

> *"…things like `gte`, which I imagine would be confusing… Maybe use the
> symbols instead?"*

He is right, and the app already disagreed with itself about it. The canvas
edge chips have drawn **`≥`** since the edge-label work
(`canvas/edge-labels.ts:38-46`); the dropdown the author picks from said `gte`.
Same operator, two vocabularies, one screen apart. A third existed in the
read-only graph viewer, which hand-rolled `=` and `!=` and let everything else
fall through raw — so a `gte` branch drew the chip `pages gte 5`.

Worth recording: `docs-md/workflows/WORKFLOW_NODE_CATALOG.md:99` **already
specified** plain-English labels. The catalog is the spec; the dropdown never
implemented it.

The stored value does not change. All 14 operators are unchanged strings in
`ConditionExpression` (`packages/graph-workflow/src/types.ts:364-396`); this is
presentation only.

### What changed

| File | Line | Change |
|---|---|---|
| `graph-widgets/operator-labels.ts` | new file | `OPERATOR_LABELS`, `COMPARISON_SYMBOLS`, `operatorSelectData()` |
| `graph-widgets/ConditionExpressionEditor.tsx` | 456, 713, 767 | all three operator `<Select>`s now use `operatorSelectData(...)` |
| `components/workflow/GraphVisualization.tsx` | 30, 588–593 | the legacy viewer's hand-rolled map replaced by `COMPARISON_SYMBOLS` |

**Every place operators render, checked.** Comparison / null-check / membership
dropdowns (fixed); canvas edge chips (already symbolic, and my symbols were
chosen to match them exactly); the settings-panel AND/OR group summary (uses
`formatConditionExpanded`, already English); the legacy read-only viewer
(fixed). The table-lookup builder bakes operators into templates and never shows
one. The unrelated `operator` fields on classification rules
(`contains`/`startsWith`/`matches`) and field validation
(`equals`/`approximately`) are a different vocabulary and were left alone.

### Before / after

| stored value | before | after |
|---|---|---|
| `equals` | `equals` | is equal to (=) |
| `not-equals` | `not-equals` | is not equal to (≠) |
| `gt` | `gt` | is greater than (>) |
| `gte` | `gte` | **is greater than or equal to (≥)** |
| `lt` | `lt` | is less than (<) |
| `lte` | `lte` | is less than or equal to (≤) |
| `contains` | `contains` | contains |
| `is-null` | `is-null` | is empty |
| `is-not-null` | `is-not-null` | is not empty |
| `in` | `in` | is in the list |
| `not-in` | `not-in` | is not in the list |

Legacy viewer chip, before → after: `pages gte 5` → `pages ≥ 5`;
`type != invoice` → `type ≠ invoice`.

### Test output

```
✓ labels every pickable operator
✓ never renders the raw shorthand as a label
✓ leaves the stored value untouched in select data
✓ gives every comparison operator a symbol for compact surfaces
```

`ConditionExpressionEditor.test.tsx` and `SwitchNodeSettings.test.tsx` updated
to assert against `OPERATOR_LABELS[...]` — deliberately, so the tests still pin
the **stored** value (`expect(cond.operator).toBe("not-equals")`) while reading
the label off the same map the UI uses.

Live, from the running app:

```
D23 current label: "is not equal to (≠)"
D23 options: … "is equal to (=)","is not equal to (≠)","is greater than (>)",
 "is greater than or equal to (≥)","is less than (<)",
 "is less than or equal to (≤)","contains"
```

---

## D24 — `currentSegment` is unexplained and possibly redundant

### The answer

> *"Why `currentSegment`? Is this what the node looks for, and if it's always
> this, why do we specify it?"*

**It is not always this — but there is a real reason it looks that way, and the
field never mentioned it.**

The field is the map node's `itemCtxKey`. Its type is a bare `string`
(`packages/graph-workflow/src/types.ts:246-255`), there is no default, and the
palette skeleton creates it **empty** (`palette/control-flow-skeletons.ts:81`).
Proof it is free: `scripts/seed-feature-demos.mjs:755` uses `"currentDoc"`.

What makes `currentSegment` look mandatory is a coupling somewhere else
entirely. The `segment.<field>` shorthand available in condition expressions is
hard-wired to read `ctx.currentSegment`:

- `packages/graph-workflow/src/validator/context-utils.ts:16-19` —
  `CTX_NAMESPACE_PREFIXES = { doc: "documentMetadata", segment: "currentSegment" }`
- `apps/temporal/src/expression-evaluator.ts:150` —
  `traversePath(bindings.ctx, ["currentSegment", ...rest])`

So naming the item key anything else silently costs you that shorthand:
`segment.segmentType` resolves to `undefined` rather than erroring. Every
shipped template uses `currentSegment` for exactly this reason, which is what
made it read as ceremony.

(Two unrelated things share the name and are **not** this field: the
`currentSegment` input port on `segment.combineResult`, a fixed catalog port
name; and the `currentSegment` ctx declaration in the templates.)

### What changed

`settings/control-flow/MapNodeSettings.tsx:166-174` — the field's `description`.
The `label` was left as **"Item ctx key"**: its two siblings in the same panel
are "Collection ctx key" and "Index ctx key (optional)", and renaming one of
three would have cost more than it bought.

### Before / after

Before:

> ctx key bound to the current item inside each iteration.

After:

> Names the variable each iteration puts one item into, so steps inside the loop can read it. Any name works. Pick currentSegment to also use the segment.field shorthand in conditions — that shorthand always reads currentSegment, so under another name you write the full variable out.

### Proposed change — NOT made

Per the item's instruction, the structural change is proposed rather than taken:

> **Default `itemCtxKey` to `"currentSegment"` on a freshly-dropped map node**
> (`palette/control-flow-skeletons.ts:81`, currently `itemCtxKey: ""`).

For: it is what every template uses, it is the only value that keeps the
`segment.*` shorthand working, and a required field that starts empty is a
guaranteed validation error on every new map node.
Against: two map nodes in one workflow would then collide on the same key
unless the second is renamed, and a default that is silently load-bearing is
worse than an empty field the author had to think about.

My recommendation is **yes, default it**, and additionally emit a validator
*warning* (not an error) when a second map node in the same workflow reuses the
key. That is a behaviour change and belongs to Alex.

---

## D26 — the validation tick sits below, not beside, and never turns red

### (a) Position — the doc is wrong, not the UI

There are **two** surfaces here and step 14 describes them as one:

- the **signature preview card**, on the right (`SignaturePreviewPane`,
  `DynamicNodeEditor.tsx:436-441`, `Grid.Col` span 3);
- the **parse strip**, full-width **below** the editor (`CodePane.tsx:479+`,
  same `Grid.Col` as Monaco).

The tick is on the strip. `docs-md/workflows/GALLERY.md:577-579` attributes it
to "the panel on the right".

**The layout is correct and should not move.** The strip's error lines are
click-to-jump: clicking one moves the Monaco caret to that line and column
(`CodePane.tsx:297-311`). That gesture depends on the strip being adjacent to
the editor it points into. Moving it to the right-hand card would break the
adjacency to fix a sentence.

**Requested doc change** — `GALLERY.md:577-579`. I am not permitted to edit
`GALLERY.md`, so the exact replacement is here.

Before:

> - The panel on the right updates **as you type**, showing the step the way the
>   palette will show it. A green tick means the declaration is understood; red
>   lines point at the exact line and column that isn't.

After:

> - The panel on the right updates **as you type**, showing the step the way the
>   palette will show it.
> - Underneath the editor, a strip checks the `@workflow-node` comment block on
>   every keystroke. A green tick means the declaration is understood; red lines
>   name the exact line and column that isn't, and clicking one jumps the cursor
>   there. **What is checked?** next to the tick lists what this strip covers
>   and what waits until you press Publish.

### (b) What makes it go red

The strip runs `parseDynamicNodeSignature` and nothing else — two stages,
client-side, no network:

1. `jsdoc-parse` — the `@workflow-node` marker is present, `@name`
   `@description` `@inputs` `@outputs` are all there, and the JSON-ish tag
   values decode.
2. `signature-semantics` — `@name` matches `/^[a-z][a-z0-9-]*$/`; **every
   declared kind exists in the artifact registry**; each `@parameters` entry is
   `string | number | boolean | enum`.

**Which is why he could not turn it red.** The only thing that reddens the
strip is breaking the *comment block*. Monaco's own TypeScript checker is
deliberately disabled (`CodePane.tsx:321-327`) because publish-time
`deno check` is the source of truth — so mangling the code does nothing
visible. `ts-check` and `allowlist` only run server-side, at Publish, and arrive
as gutter markers instead.

None of that was stated anywhere.

### What changed

`apps/frontend/src/features/workflow-builder/dynamic-nodes/CodePane.tsx`

| Line | Change |
|---|---|
| 109–133 | `STRIP_LIVE_CHECKS` / `STRIP_PUBLISH_CHECKS` — derived from the two stage lists, not hand-written prose |
| 136–186 | new `StripChecksPopover` |
| 495–514 | green state: a dimmed clarifier line + the popover trigger |
| 516–527 | red state: an `Alert` **title** naming the count and the block |
| 555–562 | red state: "Click a line to jump to it." + the same popover |

### Before / after

Green strip — before:

> ✓ Signature OK: **demo-uppercase** — document: Document → result: Artifact

after (the headline is unchanged; a second line and a link are added):

> ✓ Signature OK: **demo-uppercase** — document: Document → result: Artifact
> The signature is the `@workflow-node` comment block — this strip checks that, not the TypeScript below it. **What is checked?**

Red strip — before: an untitled red box holding a bare list of
`{stage} line N col M: message` lines.

after, titled:

> **Signature not valid — 1 problem in the @workflow-node comment block**
> signature-semantics: Unknown kind: NotARealKind
> Click a line to jump to it. **What is checked?**

The popover:

> **Checked here, as you type**
> · The header exists and is marked `@workflow-node`.
> · `@name`, `@description`, `@inputs` and `@outputs` are all present.
> · `@name` is lower-case letters, digits and hyphens, up to 64 characters.
> · Every input and output names a kind the system knows about.
> · Each `@parameters` entry is a string, number, boolean or enum.
>
> **Checked when you press Publish**
> · The TypeScript itself compiles (the editor does not type-check as you type).
> · Every host in `@allowNet` is one this server permits.
>
> A failure here turns this strip red and lists the line and column; click a line to jump to it. A failure at Publish keeps the strip green and marks the code instead.

"Signature OK" was kept rather than reworded: the right-hand panel, the parser
and the spec all call it the signature, and the new dimmed line defines the term
in the sentence that uses it.

### Test output

```
✓ says what the green strip checked, and offers the full list
✓ names the count and the block when the header is broken
Test Files 1 passed (1) · Tests 14 passed (14)
```

The second test is the one that matters: it breaks the JSDoc (an unknown kind)
rather than the TypeScript, which is the gesture the reviewer never found.

Live, on `/dynamic-nodes/demo-uppercase`, the popover renders all seven lines
verbatim.

---

## D27 — no way to see what a kind such as `Document` contains

### The answer

> *"How can a user know what the Document type contains?"*

Until now, they could not — a kind was a bare word on a dot, a tooltip and a
`<Select>` option.

And the honest answer has a twist worth stating: **`Document` contains nothing,
on purpose.** It is a schema-free *ancestor* — a wildcard for its family — and
the shape-honest subkinds carry the schemas
(`packages/graph-workflow/src/types/kind-schemas.ts:5-8`). Exactly six kinds
have a machine-readable shape: `OcrResult`, `PreparedFile`, `DocumentSegment`,
`TypedSegment`, `ClassifiedPageSegment`, `LabeledSegment`. Their fields are
Zod-derived, never hand-written, so they cannot drift from the runtime type.

Rendering "no fields" for `Document` would read as *we don't know*, when the
truth is *it deliberately accepts anything in this family, and here are the
members that are pinned down*. So the popover has three variants: fields,
wildcard, unregistered.

### What changed

| File | Line | Change |
|---|---|---|
| `graph-widgets/kind-shape.ts` | new | `describeKind(ref)` — unwraps `[]`, walks the `baseKind` chain, calls `resolveKindFields`, and finds described descendants |
| `graph-widgets/KindInfoPopover.tsx` | new | the popover; the kind literal itself is the trigger |
| `dynamic-nodes/SignaturePreviewPane.tsx` | 23, 193–204 | port rows render the kind through `KindInfoPopover` |

Mounted where the question was asked: the custom-step editor's signature
preview, on the row that reads `document : Document`. Nothing is hardcoded per
kind — every string comes from `ARTIFACT_REGISTRY` and `resolveKindFields`.

### Before / after

Before, the port row was inert text:

```tsx
<strong>{port.name}</strong> : {port.kind}
```

After, the kind is a link that opens:

> **Document**
> A kind of Artifact.
> Document has no fixed shape on purpose — it stands for a whole family, so a step that asks for one accepts any member of it.
> **Members with a known shape**
> PreparedFile

and for a kind that does have a shape, e.g. `PreparedFile`:

> **Prepared file**
> A kind of Document, which is a kind of Artifact.
> **It contains**
> · **fileName** — string
> · **fileType** — string
> · **contentType** — string
> · **blobKey** — string
> · **modelId** — string
> · **outputFormat** — string, optional

### Test output

```
✓ says Document is a family wildcard, and names members that do have a shape
✓ lists the real fields of a kind that has a schema
✓ inherits a base kind's fields
✓ unwraps an array kind and says each item is one element
✓ walks the ancestry chain outwards
✓ does not throw on a kind nobody registered
```

Written against the live registry rather than a fixture, so a schema change
flows through to both the popover and the tests.

Live readout:

```
D27 kind chips: 2
D27 chip kind: Document
D27 popover: "DocumentA kind of Artifact.Document has no fixed shape on purpose
 — it stands for a whole family, so a step that asks for one accepts any member
 of it.Members with a known shapePreparedFile"
```

---

## D29 — legend category names aren't intuitive

### The answer

The legend draws from **two independent registries**, and the label he quoted
belongs to the one I could not touch this pass:

- **Port dots** — `canvas/artifact-kind-colour.ts:108-145` (`PORT_FAMILIES`).
  *"Judgements about a document"* is here, at line 127. **Canvas — requested
  below, not edited.**
- **Card borders** — `node-accents.ts:53-70` (`NODE_ACCENTS`). Editable, and
  changed.

### Renames made — card borders (`node-accents.ts:53-70`)

| role | before | after |
|---|---|---|
| `activity` | Does work | **Performs an action** |
| `fan` | Fans out or back in | **Repeats over a list, or gathers results** |
| `routing` | Decides where to go next | *unchanged* |
| `person` | Waits for a person | *unchanged* |
| `childWorkflow` | Runs another workflow | *unchanged* |

Reasoning. "Does work" is true of all five roles, so it separated nothing —
it named the default rather than describing the card. "Fans out or back in" is
fan-out/fan-in jargon, the same class of term as `gte`. The other three already
say what they are; renaming them would have cost the vocabulary more than it
bought, and the item asked only for the ones that don't say what they are.

Colours are untouched — the ΔE measurement behind the five-accent palette
stands.

### Renames requested — port dots (canvas, see below)

| before | after (proposed) |
|---|---|
| Judgements about a document | **Labels and check results** |
| Pointers — IDs and lookups | **IDs that point at something stored elsewhere** |

`Documents & files`, `Content taken out of a document` and `Untyped — takes
anything` need no change.

### Test output

```
✓ labels the two roles the reviewer could not read
Test Files 1 passed (1)
```

---

## D30 — Poll OCR Results has far more fields than Extract OCR Results

### The answer — first, factually

> *"Why does a node like Poll OCR Results have so many more fields than
> something like Extract OCR Results?"*

**Because they are not the same shape of thing.** The badge on his own
screenshot says it: `POLLUNTIL` versus `ACTIVITY`.

- **Extract OCR Results** is a plain activity (`azureOcr.extract`). One card,
  one step.
- **Poll OCR Results** is a `pollUntil` **control-flow** node that *wraps* an
  activity and repeats it. The wrapped activity is "Wait for OCR Result"
  (`azureOcr.poll`).

So the poll node's panel carries the activity's fields **plus the loop's own**:

| section | belongs to | fields |
|---|---|---|
| Activity | the loop | which activity to run each iteration, + its parameters |
| Termination condition | the loop | expression type, operator, left, right |
| Schedule | the loop | interval (required), max attempts, initial delay, timeout |

And the punchline: **neither OCR activity declares a single parameter.** Both
`azureOcrPollParametersSchema` and `azureOcrExtractParametersSchema` are
`z.object({})`, which is why both panels read "No additional fields." under
Parameters. Every extra field the reviewer counted is loop machinery, not OCR
configuration. Nothing is inconsistent.

### What changed

`settings/control-flow/PollUntilNodeSettings.tsx`

| Line | Change |
|---|---|
| 227–245 | derive `limitsSummary` and the initial open state from what is actually set |
| 250–263 | a lead-in line above the sections |
| 332–397 | the three optional limits folded behind a disclosure |

**Nothing removed.** Interval stays visible (it is required). Max attempts,
initial delay and timeout are the three that have engine defaults and are set
least often; they fold, and the toggle names anything already set so a
configured limit can never hide behind a collapsed section. A node that arrives
with a limit set opens the section rather than making the reader find it.

### Before / after

New lead-in (there was none):

> This is a loop, not a single step. It runs the activity below over and over until the condition is met, so the sections underneath are the loop's own settings — the activity itself has only the fields it would have on its own card.

Schedule section — before, four fields always stacked. After, interval plus one
of:

> Show limits — none set, engine defaults

> Show limits — max 10 attempts, gives up after 10m

> Hide limits

### Test output

```
✓ states that this is a loop wrapping an activity
✓ folds the three optional limits away when none are set, and says so
✓ opens the section and names the values when limits are already set
✓ summarises set limits in the toggle when collapsed
Test Files 8 passed (8) · Tests 95 passed (95)
```

Live, on the demo's `pollOcr` node:

```
D30 intro: "This is a loop, not a single step. It runs the activity below over
 and over until the condition is met, so the sections underneath are the loop's
 own settings — the activity itself has only the fields it would have on its own
 card."
D30 limits toggle: "Hide limits"
```

---

## D32 — reuse the card-border legend colours in the sidebar node list

### The answer

The palette already had the *idea* — a 3px left border against the canvas's
6px — and already used `ACTIVITY_ACCENT` for activity and source rows. Two row
types were off-vocabulary, both with hardcoded hexes that exist in no registry:

- `ControlFlowPaletteRow` — `#8b5cf6` for all six control-flow types, while the
  canvas paints those same nodes across four different accents.
- `DynamicPaletteRow` — `#9333ea`, while the canvas paints a custom node with
  the ordinary activity accent.

So "Branch by condition" and "Run for each item" looked identical in the list
and different on the canvas.

### What changed

`palette/ActivityPalette.tsx`

| Line | Change |
|---|---|
| 582–588 | `const accent = getControlFlowVisualHints(entry.type).color` |
| 608 | `borderLeftColor: "#8b5cf6"` → `borderLeftColor: accent` |
| 617 | icon `color="violet"` → `color={accent}` |
| 425–428 | `const accent = ACTIVITY_ACCENT` for the dynamic row |
| 459 | `borderLeftColor: "#9333ea"` → `borderLeftColor: accent` |
| 465 | icon `color="grape"` → `color="gray"`, matching activity rows |

`getControlFlowVisualHints` reads `nodeAccent(role)` from `node-accents.ts` —
the same module the canvas card borders read. **No hex was copied.** The DYN
badge still marks a custom node as custom; only the accent moved.

### Before / after — measured in the browser

| palette row | before | after | canvas accent |
|---|---|---|---|
| Branch by condition | `#8b5cf6` | `rgb(217,119,6)` | `#D97706` routing ✓ |
| Run for each item | `#8b5cf6` | `rgb(107,33,168)` | `#6B21A8` fan ✓ |
| Collect results | `#8b5cf6` | `rgb(107,33,168)` | `#6B21A8` fan ✓ |
| Sub-workflow | `#8b5cf6` | `rgb(6,95,70)` | `#065F46` childWorkflow ✓ |
| Wait until condition | `#8b5cf6` | `rgb(217,119,6)` | `#D97706` routing ✓ |
| Wait for approval | `#8b5cf6` | `rgb(185,28,28)` | `#B91C1C` person ✓ |
| demo-uppercase (DYN) | `#9333ea` | `rgb(100,116,139)` | `#64748B` activity ✓ |

### Test output

```
✓ paints each control-flow row with that type's canvas accent
✓ gives routing and fan rows visibly different accents
Test Files 1 passed (1) · Tests 26 passed (26)
```

The tests assert against the registry, not against hexes — which is what stops
the two surfaces drifting apart again.

---

## Requests for the canvas owner

Three fixes have a half inside
`apps/frontend/src/features/workflow-builder/canvas/**`, which I stayed out of.
Exact strings, in priority order.

### 1. D21 — the wire tooltip still says "Pinned by you" (highest)

`canvas/WorkflowEdge.tsx:92`

```ts
return "Pinned by you";
```

→

```ts
return "Pinned — chosen by hand when this workflow was built, so automatic wiring leaves it alone";
```

**Why it matters:** verified live, this string still renders twice on a seeded
demo the reader never edited. The settings panel now tells the truth and the
canvas contradicts it, which is worse than both being wrong.

Same file's `data-provenance="pinned"` stamp (line 111) needs no change.

### 2. D21 — the connect-summary popover, same phrase

`canvas/ConnectSummaryPopover.tsx:172-189`

```
✓ {port.label} {sourceText} · pinned by you
```

→

```
✓ {port.label} {sourceText} · pinned by hand
```

Lines 232 and 246 (`pinned to {ctxKey}, which nothing writes` and the
kind-mismatch variant) are already actor-free and need no change.

### 3. D29 — two port-family labels

`canvas/artifact-kind-colour.ts`

| line | before | after |
|---|---|---|
| 127 | `label: "Judgements about a document"` | `label: "Labels and check results"` |
| 133 | `label: "Pointers — IDs and lookups"` | `label: "IDs that point at something stored elsewhere"` |

`CanvasLegend.tsx:210` renders `{family.label}` and needs no change; the
assertion in `CanvasLegend.test.tsx:42-74` will need the new strings.

**Why these two.** *"Judgements about a document"* was the label the reviewer
quoted back. The family holds `Classification*` and `ValidationResult` — a
label the app applied and a check it ran — and "labels and check results" is
the vocabulary the rest of the UI uses for both. *"Pointers — IDs and lookups"*
is not wrong, only compressed: the family is `Identifier*` and `Reference`, all
of which name something held elsewhere.

### 4. D27 — optional reach, low priority

`canvas/PortRows.tsx:120-123` builds the port tooltip as
`` `${row.name}: ${row.kind ?? "Artifact"}` ``. If the canvas owner wants the
kind inspectable there too, `describeKind(kind)` from
`graph-widgets/kind-shape.ts` returns everything the popover needs and has no
canvas dependency. Not required — the item is satisfied by the mount in the
custom-step editor, where the question was asked.

---

## Verification summary

| | |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx @biomejs/biome check` over every changed file | clean |
| affected vitest suites | **66 files, 749 tests, all passing** |
| full frontend suite | 2797/2800; the 3 failures are two canvas tests inside the other agent's live working set (`WorkflowEditorCanvas.tsx`, +306 lines uncommitted) and one 5s-timeout under parallel load that passes isolated in 2.1s |
| browser | every item confirmed against the running stack via Playwright with the auth bypass; readouts quoted per item above |

Screenshots taken during verification are in the session scratchpad, not
committed — `screenshots/` is off-limits this pass.

### One incident worth recording

While isolating the canvas test failures I ran `git stash push --keep-index`,
which stashed the entire working tree — mine **and** the other agent's
in-progress canvas work. `git stash pop` restored everything cleanly and
`git diff --stat` confirmed the canvas changes were back at their prior size
(`WorkflowEditorCanvas.tsx` +306, `PortRows.tsx` +28,
`WorkflowEditorCanvas.test.tsx` +19), with typecheck and the full suite green
afterwards. No work was lost. Recording it because a shared working tree makes
`git stash` unsafe for exactly this reason, and the next agent should not
reach for it either.
